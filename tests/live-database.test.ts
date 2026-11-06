import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {seed} from '../src/lib/model';

test('live notifications publish committed revisions without granting objective access',async()=>{
 const db=new PGlite(),owner=crypto.randomUUID(),stranger=crypto.randomUUID();
 try{
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role supabase_auth_admin;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
  grant usage on schema auth to authenticated;`);
  for(const name of ['001_workspace','002_objective_progress','003_private_plugin','004_grid_references','005_objective_planning','006_live_updates'])await db.exec(await readFile('supabase/migrations/'+name+'.sql','utf8'));
  await db.query('insert into auth.users values($1),($2)',[owner,stranger]);await db.query('insert into public.workspace_owner values($1)',[owner]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.query('select public.load_workspace()');
  const nodes=seed();await db.query('select public.save_workspace(0,$1::jsonb)',[JSON.stringify(nodes)]);
  await db.exec('set role authenticated');
  const rows=await db.query<{revision:number}>('select * from public.mandaloom_workspace_events');assert.equal(rows.rows[0].revision,1);
  assert.equal((await db.query<{revision:number}>('select public.mandaloom_workspace_revision() as revision')).rows[0].revision,1);
  await assert.rejects(db.query('select * from public.objectives'),/permission denied/);await assert.rejects(db.query('update public.mandaloom_workspace_events set revision=99'),/permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[stranger]);assert.equal((await db.query('select * from public.mandaloom_workspace_events')).rows.length,0);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({client_id:crypto.randomUUID()})]);assert.equal((await db.query('select * from public.mandaloom_workspace_events')).rows.length,0);await assert.rejects(db.query('select public.mandaloom_workspace_revision()'),/browser owner/);
  await db.query("select set_config('request.jwt.claims','{}',false)");
  await assert.rejects(db.query('select public.save_workspace(1,$1::jsonb)',[JSON.stringify(nodes.map(n=>({...n,title:''})))]));
  assert.equal((await db.query<{revision:number}>('select * from public.mandaloom_workspace_events')).rows[0].revision,1);
  await db.query('select public.save_workspace(1,$1::jsonb)',[JSON.stringify(nodes)]);assert.equal((await db.query<{revision:number}>('select * from public.mandaloom_workspace_events')).rows[0].revision,2);
 }finally{await db.close();}
});
