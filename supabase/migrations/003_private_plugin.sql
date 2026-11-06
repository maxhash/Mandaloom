-- Apply after 002. Then select mandaloom_access_token_hook under Auth > Hooks.
-- This migration does not change any objectives or reset workspace revisions.
begin;
create table public.mandaloom_connections (
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid not null,
 client_name text not null check(length(client_name) between 1 and 300),
 can_write boolean not null default false,
 grant_version uuid not null default gen_random_uuid(),
 created_at timestamptz not null default now(),
 primary key(user_id,client_id)
);
create table public.mandaloom_tool_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid not null, request_id uuid not null,
 fingerprint text not null check(length(fingerprint)=64),
 result jsonb not null, created_at timestamptz not null default now(),
 primary key(user_id,client_id,request_id)
);
alter table public.mandaloom_connections enable row level security;
alter table public.mandaloom_tool_receipts enable row level security;
revoke all on public.mandaloom_connections,public.mandaloom_tool_receipts from public,anon,authenticated;

create function public.mandaloom_assert_browser_owner() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or nullif(auth.jwt()->>'client_id','') is not null or not exists(select 1 from public.workspace_owner where user_id=auth.uid()) then
  raise exception 'Private workspace: browser owner access required';
 end if;
end $$;
revoke all on function public.mandaloom_assert_browser_owner() from public,anon,authenticated;

create function public.mandaloom_grant_connection(oauth_client_id uuid,display_name text,allow_write boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.mandaloom_assert_browser_owner();
 if oauth_client_id is null or allow_write is null then raise exception 'Invalid connection'; end if;
 insert into public.mandaloom_connections(user_id,client_id,client_name,can_write)
 values(auth.uid(),oauth_client_id,display_name,allow_write)
 on conflict(user_id,client_id) do update set client_name=excluded.client_name,can_write=excluded.can_write,grant_version=gen_random_uuid();
end $$;
create function public.mandaloom_list_connections() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.mandaloom_assert_browser_owner();
 return coalesce((select jsonb_agg(jsonb_build_object('clientId',client_id,'name',client_name,'canWrite',can_write,'createdAt',created_at) order by created_at) from public.mandaloom_connections where user_id=auth.uid()),'[]'::jsonb);
end $$;
create function public.mandaloom_revoke_connection(oauth_client_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.mandaloom_assert_browser_owner();
 delete from public.mandaloom_connections where user_id=auth.uid() and client_id=oauth_client_id;
end $$;

-- Supabase continues to issue/rotate the OAuth tokens. This hook binds approved
-- tokens to the Mandaloom resource while leaving browser login tokens unchanged.
create function public.mandaloom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=event->'claims'; connection public.mandaloom_connections; cid text;
begin
 cid:=coalesce(nullif(event->>'client_id',''),nullif(claims->>'client_id',''));
 claims:=claims-'resource'-'mandaloom_permissions'-'mandaloom_grant';
 if cid is not null then
  select * into connection from public.mandaloom_connections where user_id=(event->>'user_id')::uuid and client_id=cid::uuid;
  if found and exists(select 1 from public.workspace_owner where user_id=connection.user_id) then
   claims:=claims || jsonb_build_object('resource','https://mandaloom.vercel.app/mcp','mandaloom_permissions',case when connection.can_write then jsonb_build_array('read','write') else jsonb_build_array('read') end,'mandaloom_grant',connection.grant_version);
  end if;
 end if;
 return jsonb_set(event,'{claims}',claims);
end $$;
revoke all on function public.mandaloom_access_token_hook(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.mandaloom_access_token_hook(jsonb) to supabase_auth_admin;

create function public.mandaloom_assert_plugin_permission(needs_write boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare claims jsonb:=auth.jwt(); connection public.mandaloom_connections;
begin
 if auth.uid() is null or claims->>'resource' is distinct from 'https://mandaloom.vercel.app/mcp' or not coalesce(claims->'mandaloom_permissions' ? 'read',false) or not exists(select 1 from public.workspace_owner where user_id=auth.uid()) then
  raise exception 'Mandaloom plugin authorization required';
 end if;
 -- Live grant check makes revocation immediate, even for unexpired tokens.
 select * into connection from public.mandaloom_connections where user_id=auth.uid() and client_id=(claims->>'client_id')::uuid for share;
 if not found or connection.grant_version::text is distinct from claims->>'mandaloom_grant' then raise exception 'Mandaloom connection revoked or changed'; end if;
 if needs_write and (not connection.can_write or not coalesce(claims->'mandaloom_permissions' ? 'write',false)) then raise exception 'Read-only connection: editing is not permitted'; end if;
end $$;
revoke all on function public.mandaloom_assert_plugin_permission(boolean) from public,anon,authenticated;

-- Keep the existing validated snapshot storage implementation private. Browser
-- sessions retain the same API; OAuth clients must use permission-checked RPCs.
alter function public.load_workspace() rename to mandaloom_load_internal;
alter function public.save_workspace(bigint,jsonb) rename to mandaloom_save_internal;
revoke all on function public.mandaloom_load_internal() from public,anon,authenticated;
revoke all on function public.mandaloom_save_internal(bigint,jsonb) from public,anon,authenticated;
create function public.load_workspace() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.mandaloom_assert_browser_owner(); return public.mandaloom_load_internal(); end $$;
create function public.save_workspace(expected_revision bigint,payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$
begin perform public.mandaloom_assert_browser_owner(); return public.mandaloom_save_internal(expected_revision,payload); end $$;
create function public.mandaloom_plugin_load() returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.mandaloom_assert_plugin_permission(false); return public.mandaloom_load_internal(); end $$;
create function public.mandaloom_plugin_receipt(operation_id uuid,operation_fingerprint text) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt public.mandaloom_tool_receipts;
begin
 perform public.mandaloom_assert_plugin_permission(false);
 select * into receipt from public.mandaloom_tool_receipts where user_id=auth.uid() and client_id=(auth.jwt()->>'client_id')::uuid and request_id=operation_id;
 if not found then return null; end if;
 if receipt.fingerprint<>operation_fingerprint then raise exception 'Request ID reused with different arguments'; end if;
 return receipt.result;
end $$;
create function public.mandaloom_plugin_commit(expected_revision bigint,payload jsonb,operation_id uuid,operation_fingerprint text,operation_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt jsonb; revision bigint; result jsonb;
begin
 perform public.mandaloom_assert_plugin_permission(true);
 if operation_id is null or operation_fingerprint is null or length(operation_fingerprint)<>64 then raise exception 'Invalid operation identity'; end if;
 -- Serialize all saves on the same lock as the browser autosave implementation.
 select w.revision into revision from public.workspaces w where user_id=auth.uid() for update;
 receipt:=public.mandaloom_plugin_receipt(operation_id,operation_fingerprint);
 if receipt is not null then return receipt; end if;
 if revision is null or revision<>expected_revision then raise exception 'Save conflict: workspace changed. Read it again before editing.'; end if;
 if jsonb_typeof(payload) is distinct from 'array' then raise exception 'Invalid payload'; end if;
 -- An editing token must not become a back door to delete or move objectives
 -- through the underlying PostgREST RPC, even outside the MCP tool interface.
 if exists(select 1 from public.objectives n where n.user_id=auth.uid() and not exists(select 1 from jsonb_array_elements(payload) x where x->>'id'=n.id::text)) then raise exception 'Plugin editing cannot delete existing objectives'; end if;
 if exists(select 1 from public.objectives n join jsonb_array_elements(payload) x on x->>'id'=n.id::text where n.user_id=auth.uid() and ((x->>'parentId')::uuid is distinct from n.parent_id or (x->>'rootId')::uuid is distinct from n.root_id or (x->>'position')::smallint is distinct from n.position or (x->>'createdAt')::timestamptz is distinct from n.created_at)) then raise exception 'Plugin editing cannot move objectives or change their identity'; end if;
 revision:=public.mandaloom_save_internal(expected_revision,payload);
 result:=operation_result || jsonb_build_object('revision',revision);
 insert into public.mandaloom_tool_receipts(user_id,client_id,request_id,fingerprint,result) values(auth.uid(),(auth.jwt()->>'client_id')::uuid,operation_id,operation_fingerprint,result);
 return result;
end $$;

revoke all on function public.load_workspace(),public.save_workspace(bigint,jsonb),public.mandaloom_grant_connection(uuid,text,boolean),public.mandaloom_list_connections(),public.mandaloom_revoke_connection(uuid),public.mandaloom_plugin_load(),public.mandaloom_plugin_receipt(uuid,text),public.mandaloom_plugin_commit(bigint,jsonb,uuid,text,jsonb) from public,anon;
grant execute on function public.load_workspace(),public.save_workspace(bigint,jsonb),public.mandaloom_grant_connection(uuid,text,boolean),public.mandaloom_list_connections(),public.mandaloom_revoke_connection(uuid),public.mandaloom_plugin_load(),public.mandaloom_plugin_receipt(uuid,text),public.mandaloom_plugin_commit(bigint,jsonb,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
