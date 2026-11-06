import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {makeNode,seed} from '../src/lib/model';

test('plugin database gates OAuth tokens, enforces revocation/read-only, and atomically deduplicates writes',async()=>{
 const db=new PGlite(),owner=crypto.randomUUID(),stranger=crypto.randomUUID(),clientId=crypto.randomUUID();
 try{
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role supabase_auth_admin;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`);
  for(const name of ['001_workspace','002_objective_progress','003_private_plugin'])await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
  await db.query('insert into auth.users values($1),($2)',[owner,stranger]);await db.query('insert into public.workspace_owner values($1)',[owner]);
  const browser=async()=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.query("select set_config('request.jwt.claims','{}',false)");};
  const oauth=async(claims:unknown)=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);
  const hook=async()=>{const event={user_id:owner,client_id:clientId,claims:{sub:owner,client_id:clientId,aud:'authenticated',iss:'https://project.supabase.co/auth/v1',role:'authenticated',exp:9999999999}};return (await db.query<{event:{claims:Record<string,unknown>}}>('select public.mandaloom_access_token_hook($1::jsonb) as event',[JSON.stringify(event)])).rows[0].event.claims;};
  await browser();await db.query('select public.load_workspace()');const nodes=seed();await db.query('select public.save_workspace(0,$1::jsonb)',[JSON.stringify(nodes)]);
  const unapproved=await hook();assert.equal(unapproved.resource,undefined);await oauth(unapproved);await assert.rejects(db.query('select public.mandaloom_plugin_load()'),/authorization required/);
  await browser();await db.query('select public.mandaloom_grant_connection($1,$2,false)',[clientId,'ChatGPT']);
  const readOnly=await hook();assert.deepEqual(readOnly.mandaloom_permissions,['read']);await oauth(readOnly);
  assert.equal((await db.query<{data:{nodes:unknown[]}}>('select public.mandaloom_plugin_load() as data')).rows[0].data.nodes.length,9);
  await assert.rejects(db.query('select public.load_workspace()'),/browser owner/);await assert.rejects(db.query('select public.save_workspace(1,$1::jsonb)',[JSON.stringify(nodes)]),/browser owner/);
  const operationId=crypto.randomUUID(), fingerprint='a'.repeat(64);
  const commit=(revision:number,payload:unknown,requestId=operationId,hash=fingerprint)=>db.query<{result:{revision:number}}>('select public.mandaloom_plugin_commit($1,$2::jsonb,$3,$4,$5::jsonb) as result',[revision,JSON.stringify(payload),requestId,hash,JSON.stringify({created:['test']})]);
  await assert.rejects(commit(1,nodes),/Read-only/);
  await assert.rejects(db.query('select public.mandaloom_grant_connection($1,$2,true)',[clientId,'Escalate']),/browser owner/);
  await browser();await db.query('select public.mandaloom_grant_connection($1,$2,true)',[clientId,'ChatGPT']);const editable=await hook();await oauth(readOnly);await assert.rejects(db.query('select public.mandaloom_plugin_load()'),/revoked or changed/);
  await oauth(editable);const expanded=[...nodes,makeNode('New root')];assert.equal((await commit(1,expanded)).rows[0].result.revision,2);
  await assert.rejects(commit(2,expanded.slice(1),crypto.randomUUID()),/cannot delete/);
  await assert.rejects(commit(2,expanded.map((n,i)=>i===1?{...n,position:1}:i===2?{...n,position:0}:n),crypto.randomUUID()),/cannot move/);
  assert.equal((await commit(1,expanded)).rows[0].result.revision,2);
  await assert.rejects(commit(2,expanded,operationId,'b'.repeat(64)),/reused/);
  await assert.rejects(commit(1,expanded,crypto.randomUUID()),/conflict/);
  const loaded=(await db.query<{data:{revision:number;nodes:unknown[]}}>('select public.mandaloom_plugin_load() as data')).rows[0].data;assert.equal(loaded.revision,2);assert.equal(loaded.nodes.length,10);
  await db.exec('set role authenticated');await assert.rejects(db.query('select public.mandaloom_load_internal()'),/permission denied/);await assert.rejects(db.query('select * from public.mandaloom_connections'),/permission denied/);await assert.rejects(db.query('select public.mandaloom_access_token_hook($1::jsonb)',['{}']),/permission denied/);await db.exec('reset role');
  await browser();await db.query('select public.mandaloom_revoke_connection($1)',[clientId]);await oauth(editable);await assert.rejects(db.query('select public.mandaloom_plugin_load()'),/revoked or changed/);await assert.rejects(commit(2,expanded,crypto.randomUUID()),/revoked or changed/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[stranger]);await assert.rejects(db.query('select public.mandaloom_plugin_load()'),/authorization required/);
  await browser();assert.equal((await db.query<{data:{revision:number}}>('select public.load_workspace() as data')).rows[0].data.revision,2);
 }finally{await db.close();}
});
