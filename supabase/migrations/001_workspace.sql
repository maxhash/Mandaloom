-- Run once in the Supabase SQL editor, then provision exactly one owner below.
create table public.workspace_owner (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.workspace_owner enable row level security;
-- No client policies: owner assignment is an administrative operation only.
create table public.workspaces (user_id uuid primary key references auth.users(id) on delete cascade, revision bigint not null default 0);
create table public.objectives (
 user_id uuid not null references public.workspaces(user_id) on delete cascade,
 id uuid not null, parent_id uuid, root_id uuid not null, position smallint not null,
 title text not null check(length(trim(title)) between 1 and 300), description text not null default '' check(length(description)<=20000),
 completed boolean not null default false, created_at timestamptz not null, updated_at timestamptz not null,
 primary key(user_id,id),
 foreign key(user_id,parent_id) references public.objectives(user_id,id) deferrable initially deferred,
 foreign key(user_id,root_id) references public.objectives(user_id,id) deferrable initially deferred,
 check ((parent_id is null and position=4 and root_id=id) or (parent_id is not null and position in (0,1,2,3,5,6,7,8)))
);
create unique index objective_slot on public.objectives(user_id,parent_id,position) where parent_id is not null;
create index objective_parent on public.objectives(user_id,parent_id);
alter table public.workspaces enable row level security;
alter table public.objectives enable row level security;
-- All access is through these owner-checked functions. No direct client writes.
create function public.load_workspace() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
 if uid is null or not exists(select 1 from public.workspace_owner where user_id=uid) then raise exception 'Private workspace: access denied'; end if;
 insert into public.workspaces(user_id) values(uid) on conflict do nothing;
 select jsonb_build_object('revision',w.revision,'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'parentId',n.parent_id,'rootId',n.root_id,'position',n.position,'title',n.title,'description',n.description,'completed',n.completed,'createdAt',n.created_at,'updatedAt',n.updated_at) order by n.created_at,n.position) from public.objectives n where n.user_id=uid),'[]'::jsonb)) into result from public.workspaces w where w.user_id=uid;
 return result;
end $$;
create function public.save_workspace(expected_revision bigint,payload jsonb) returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_revision bigint;
begin
 if uid is null or not exists(select 1 from public.workspace_owner where user_id=uid) then raise exception 'Private workspace: access denied'; end if;
 if jsonb_typeof(payload) <> 'array' then raise exception 'Invalid payload'; end if;
 select revision into current_revision from public.workspaces where user_id=uid for update;
 if current_revision is null or current_revision <> expected_revision then raise exception 'Save conflict: cloud data changed. Download recovery, then reload cloud.'; end if;
 -- Replacement and validation are one transaction; errors roll back the old hierarchy.
 delete from public.objectives where user_id=uid;
 insert into public.objectives(user_id,id,parent_id,root_id,position,title,description,completed,created_at,updated_at)
 select uid,(x->>'id')::uuid,(x->>'parentId')::uuid,(x->>'rootId')::uuid,(x->>'position')::smallint,x->>'title',x->>'description',(x->>'completed')::boolean,(x->>'createdAt')::timestamptz,(x->>'updatedAt')::timestamptz from jsonb_array_elements(payload) x;
 if exists(select 1 from public.objectives n join public.objectives p on p.user_id=n.user_id and p.id=n.parent_id where n.user_id=uid and n.root_id<>p.root_id) then raise exception 'Inconsistent root'; end if;
 -- Every node must be reachable from a root; UNION avoids looping on malformed data.
 if (with recursive reachable(id) as (select id from public.objectives where user_id=uid and parent_id is null union select n.id from public.objectives n join reachable r on n.parent_id=r.id where n.user_id=uid) select count(*) from reachable) <> jsonb_array_length(payload) then raise exception 'Hierarchy has missing parents or cycles'; end if;
 update public.workspaces set revision=revision+1 where user_id=uid returning revision into current_revision;
 return current_revision;
end $$;
revoke all on function public.load_workspace() from public, anon;
revoke all on function public.save_workspace(bigint,jsonb) from public, anon;
grant execute on function public.load_workspace() to authenticated;
grant execute on function public.save_workspace(bigint,jsonb) to authenticated;
revoke all on public.workspace_owner,public.workspaces,public.objectives from anon,authenticated;
