-- Apply after 005. Only revision notifications are exposed to Realtime.
-- Objective content remains behind the existing owner-checked RPC functions.
begin;
create table public.mandaloom_workspace_events(
 user_id uuid primary key references public.workspaces(user_id) on delete cascade,
 revision bigint not null
);
alter table public.mandaloom_workspace_events enable row level security;
revoke all on public.mandaloom_workspace_events from public,anon,authenticated;
grant select on public.mandaloom_workspace_events to authenticated;
create function public.mandaloom_can_receive_updates() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and nullif(auth.jwt()->>'client_id','') is null
 and exists(select 1 from public.workspace_owner where user_id=auth.uid());
$$;
revoke all on function public.mandaloom_can_receive_updates() from public,anon;
grant execute on function public.mandaloom_can_receive_updates() to authenticated;
create policy browser_owner_updates on public.mandaloom_workspace_events for select to authenticated
using(user_id=(select auth.uid()) and (select public.mandaloom_can_receive_updates()));
create function public.mandaloom_emit_workspace_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.mandaloom_workspace_events(user_id,revision) values(new.user_id,new.revision)
 on conflict(user_id) do update set revision=excluded.revision;
 return new;
end $$;
revoke all on function public.mandaloom_emit_workspace_update() from public,anon,authenticated;
create trigger mandaloom_workspace_updated after insert or update of revision on public.workspaces
for each row execute function public.mandaloom_emit_workspace_update();
insert into public.mandaloom_workspace_events select user_id,revision from public.workspaces;
create function public.mandaloom_workspace_revision() returns bigint
language plpgsql security definer set search_path='' as $$
begin
 perform public.mandaloom_assert_browser_owner();
 return (select revision from public.workspaces where user_id=auth.uid());
end $$;
revoke all on function public.mandaloom_workspace_revision() from public,anon;
grant execute on function public.mandaloom_workspace_revision() to authenticated;
do $$ begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  create publication supabase_realtime;
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='mandaloom_workspace_events') then
  alter publication supabase_realtime add table public.mandaloom_workspace_events;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
