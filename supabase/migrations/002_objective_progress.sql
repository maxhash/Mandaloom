-- Apply after 001_workspace.sql, BEFORE deploying the updated application.
-- Existing titles, descriptions, relationships, positions and timestamps remain intact.
begin;
alter table public.objectives
 add column status text not null default 'Not started' check(status in ('Not started','In progress','Blocked','Complete')),
 add column deliverable text not null default '' check(length(deliverable)<=1000),
 add column completion_criteria text not null default '' check(length(completion_criteria)<=20000),
 add column next_action text not null default '' check(length(next_action)<=1000);
update public.objectives set status=case when completed then 'Complete' else 'Not started' end;
-- Invalidate open editors so pre-migration snapshots cannot overwrite upgraded data.
update public.workspaces set revision=revision+1;
-- Keep completed as a compatibility mirror only; status is the source of truth.
create or replace function public.load_workspace() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
 if uid is null or not exists(select 1 from public.workspace_owner where user_id=uid) then raise exception 'Private workspace: access denied'; end if;
 insert into public.workspaces(user_id) values(uid) on conflict do nothing;
 select jsonb_build_object('schemaVersion',2,'revision',w.revision,'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'parentId',n.parent_id,'rootId',n.root_id,'position',n.position,'title',n.title,'description',n.description,'status',n.status,'deliverable',n.deliverable,'completionCriteria',n.completion_criteria,'nextAction',n.next_action,'createdAt',n.created_at,'updatedAt',n.updated_at) order by n.created_at,n.position) from public.objectives n where n.user_id=uid),'[]'::jsonb)) into result from public.workspaces w where w.user_id=uid;
 return result;
end $$;
create or replace function public.save_workspace(expected_revision bigint,payload jsonb) returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_revision bigint;
begin
 if uid is null or not exists(select 1 from public.workspace_owner where user_id=uid) then raise exception 'Private workspace: access denied'; end if;
 if jsonb_typeof(payload) <> 'array' then raise exception 'Invalid payload'; end if;
 select revision into current_revision from public.workspaces where user_id=uid for update;
 if current_revision is null or current_revision <> expected_revision then raise exception 'Save conflict: cloud data changed. Download recovery, then reload cloud.'; end if;
 if exists(select 1 from jsonb_array_elements(payload) x where x->>'status' is null) then raise exception 'Please refresh Mandaloom before saving: progress fields require the updated app.'; end if;
 -- Replacement and validation are one transaction; errors roll back the old hierarchy.
 delete from public.objectives where user_id=uid;
 insert into public.objectives(user_id,id,parent_id,root_id,position,title,description,completed,status,deliverable,completion_criteria,next_action,created_at,updated_at)
 select uid,(x->>'id')::uuid,(x->>'parentId')::uuid,(x->>'rootId')::uuid,(x->>'position')::smallint,x->>'title',x->>'description',(x->>'status'='Complete'),x->>'status',coalesce(x->>'deliverable',''),coalesce(x->>'completionCriteria',''),coalesce(x->>'nextAction',''),(x->>'createdAt')::timestamptz,(x->>'updatedAt')::timestamptz from jsonb_array_elements(payload) x;
 if exists(select 1 from public.objectives n join public.objectives p on p.user_id=n.user_id and p.id=n.parent_id where n.user_id=uid and n.root_id<>p.root_id) then raise exception 'Inconsistent root'; end if;
 -- Every node must be reachable from a root; UNION avoids looping on malformed data.
 if (with recursive reachable(id) as (select id from public.objectives where user_id=uid and parent_id is null union select n.id from public.objectives n join reachable r on n.parent_id=r.id where n.user_id=uid) select count(*) from reachable) <> jsonb_array_length(payload) then raise exception 'Hierarchy has missing parents or cycles'; end if;
 update public.workspaces set revision=revision+1 where user_id=uid returning revision into current_revision;
 return current_revision;
end $$;

notify pgrst, 'reload schema';
commit;
