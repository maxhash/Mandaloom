-- Apply after 004. Existing content and status remain unchanged.
begin;
alter table public.objectives add column due_date date, add column priority text not null default 'Normal' check(priority in ('Normal','High','Low'));
update public.workspaces set revision=revision+1;
create or replace function public.mandaloom_load_internal() returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
 if uid is null or not exists(select 1 from public.workspace_owner where user_id=uid) then raise exception 'Private workspace: access denied'; end if;
 insert into public.workspaces(user_id) values(uid) on conflict do nothing;
 select jsonb_build_object('schemaVersion',2,'referenceVersion',1,'planningVersion',1,'nextRootNumber',w.next_root_number,'revision',w.revision,'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'parentId',n.parent_id,'rootId',n.root_id,'position',n.position,'referenceNumber',n.reference_number,'nextChildNumber',n.next_child_number,'title',n.title,'description',n.description,'status',n.status,'deliverable',n.deliverable,'completionCriteria',n.completion_criteria,'nextAction',n.next_action,'dueDate',coalesce(n.due_date::text,''),'priority',n.priority,'createdAt',n.created_at,'updatedAt',n.updated_at) order by n.created_at,n.position) from public.objectives n where n.user_id=uid),'[]'::jsonb)) into result from public.workspaces w where w.user_id=uid;
 return result;
end $$;
create or replace function public.mandaloom_save_internal(expected_revision bigint,payload jsonb) returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); current_revision bigint; root_next integer; previous jsonb; counters jsonb; enriched jsonb:='[]'; item jsonb; old_node jsonb; scope text; number integer; desired integer; child_next integer;
begin
 if uid is null or not exists(select 1 from public.workspace_owner where user_id=uid) then raise exception 'Private workspace: access denied'; end if;
 if jsonb_typeof(payload) <> 'array' then raise exception 'Invalid payload'; end if;
 select revision,next_root_number into current_revision,root_next from public.workspaces where user_id=uid for update;
 if current_revision is null or current_revision <> expected_revision then raise exception 'Save conflict: cloud data changed. Download recovery, then reload cloud.'; end if;
 if exists(select 1 from jsonb_array_elements(payload) x where x->>'status' is null) then raise exception 'Please refresh Mandaloom before saving: progress fields require the updated app.'; end if;

 select coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) into previous from public.objectives n where user_id=uid;
 counters:=jsonb_build_object('ROOT',root_next);
 for item in select to_jsonb(n) from public.objectives n where user_id=uid loop
  counters:=jsonb_set(counters,array[item->>'id'],to_jsonb((item->>'next_child_number')::integer));
 end loop;
 -- Existing numbers never change. New numbers consume monotonically increasing
 -- counters, even when the old child/root with that number was deleted.
 for item in select x from jsonb_array_elements(payload) x order by (x->>'parentId')::uuid nulls first,(x->>'referenceNumber')::integer nulls last,(x->>'position')::integer,(x->>'createdAt')::timestamptz,(x->>'id')::uuid loop
  old_node:=previous->(item->>'id');
  item:=item || jsonb_build_object('dueDate',coalesce(item->>'dueDate',old_node->>'due_date',''),'priority',coalesce(item->>'priority',old_node->>'priority','Normal'));
  if item->>'dueDate'<>'' and (item->>'dueDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (item->>'dueDate')::date::text<>item->>'dueDate') then raise exception 'Invalid due date'; end if;
  scope:=coalesce(item->>'parentId','ROOT');
  desired:=(item->>'referenceNumber')::integer;
  if old_node is not null then
   if (item->>'parentId')::uuid is distinct from (old_node->>'parent_id')::uuid then raise exception 'Moving to another parent is not supported for numbered objectives'; end if;
   number:=(old_node->>'reference_number')::integer;
   if desired is not null and desired<>number then raise exception 'Existing objective references cannot be changed'; end if;
  else
   number:=coalesce(desired,(counters->>scope)::integer,1);
   if number<coalesce((counters->>scope)::integer,1) or number>=2147483647 then raise exception 'Reference number has already been issued or is invalid'; end if;
   counters:=jsonb_set(counters,array[scope],to_jsonb(number+1));
  end if;
  enriched:=enriched || jsonb_build_array(item || jsonb_build_object('referenceNumber',number));
 end loop;
 -- Imported hierarchies retain deleted-child gaps through their parent counters.
 for item in select x from jsonb_array_elements(enriched) x loop
  child_next:=greatest(coalesce((counters->>(item->>'id'))::integer,1),coalesce((item->>'nextChildNumber')::integer,1));
  if child_next<1 then raise exception 'Invalid child reference counter'; end if;
  counters:=jsonb_set(counters,array[item->>'id'],to_jsonb(child_next));
 end loop;
 payload:=enriched;
 -- Replacement and validation are one transaction; errors roll back the old hierarchy.
 delete from public.objectives where user_id=uid;
 insert into public.objectives(user_id,id,parent_id,root_id,position,title,description,completed,status,deliverable,completion_criteria,next_action,created_at,updated_at,reference_number,next_child_number,due_date,priority)
 select uid,(x->>'id')::uuid,(x->>'parentId')::uuid,(x->>'rootId')::uuid,(x->>'position')::smallint,x->>'title',x->>'description',(x->>'status'='Complete'),x->>'status',coalesce(x->>'deliverable',''),coalesce(x->>'completionCriteria',''),coalesce(x->>'nextAction',''),(x->>'createdAt')::timestamptz,(x->>'updatedAt')::timestamptz,(x->>'referenceNumber')::integer,coalesce((counters->>(x->>'id'))::integer,1),nullif(x->>'dueDate','')::date,x->>'priority' from jsonb_array_elements(payload) x;
 if exists(select 1 from public.objectives n join public.objectives p on p.user_id=n.user_id and p.id=n.parent_id where n.user_id=uid and n.root_id<>p.root_id) then raise exception 'Inconsistent root'; end if;
 -- Every node must be reachable from a root; UNION avoids looping on malformed data.
 if (with recursive reachable(id) as (select id from public.objectives where user_id=uid and parent_id is null union select n.id from public.objectives n join reachable r on n.parent_id=r.id where n.user_id=uid) select count(*) from reachable) <> jsonb_array_length(payload) then raise exception 'Hierarchy has missing parents or cycles'; end if;
 update public.workspaces set revision=revision+1,next_root_number=(counters->>'ROOT')::integer where user_id=uid returning revision into current_revision;
 return current_revision;
end $$;


notify pgrst,'reload schema';
commit;
