import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {seed} from '../src/lib/model';
test('Postgres owner enforcement, stale revisions, structural validation and atomic rollback',async()=>{
 const db=new PGlite();const owner=crypto.randomUUID(),stranger=crypto.randomUUID();
 try {
 await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
 await db.exec(await readFile('supabase/migrations/001_workspace.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/002_objective_progress.sql','utf8'));
 await db.query('insert into auth.users values ($1),($2)',[owner,stranger]);await db.query('insert into public.workspace_owner values ($1)',[owner]);
 await assert.rejects(db.query('select public.load_workspace()'),/access denied/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[stranger]);await assert.rejects(db.query('select public.load_workspace()'),/access denied/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
 const read=async()=> (await db.query<{data:{revision:number;nodes:unknown[]}}>('select public.load_workspace() as data')).rows[0].data;
 assert.equal((await read()).revision,0);
 const nodes=seed();const save=(r:number,n:unknown)=>db.query('select public.save_workspace($1,$2::jsonb)',[r,JSON.stringify(n)]);
 await save(0,nodes);assert.equal((await read()).nodes.length,9);
 await assert.rejects(save(0,nodes),/conflict/);
 await assert.rejects(save(1,[...nodes,{...nodes[1],id:crypto.randomUUID()}]));
 await assert.rejects(save(1,nodes.map(n=>({...n,status:'Unknown'}))));
 await assert.rejects(save(1,nodes.map(n=>({...n,deliverable:'x'.repeat(1001)}))));
 await assert.rejects(save(1,nodes.map((n,i)=>i===1?{...n,parentId:crypto.randomUUID()}:n)));
 await assert.rejects(save(1,nodes.map((n,i)=>i===1?{...n,title:''}:n)));
 const cycle=nodes.map(n=>({...n}));cycle[0].parentId=cycle[1].id;cycle[0].position=1;
 await assert.rejects(save(1,cycle),/cycles/);
 assert.equal((await read()).revision,1);assert.equal((await read()).nodes.length,9);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.objectives'),/permission denied/);await assert.rejects(db.query('insert into public.workspace_owner values ($1)',[stranger]),/permission denied/);await db.exec('reset role');
 await save(1,[]);assert.equal((await read()).nodes.length,0);
 }finally{await db.close();}
});
test('progress migration preserves legacy rows and round-trips every progress field',async()=>{
 const db=new PGlite(), owner=crypto.randomUUID();
 try {
  await db.exec(`create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  await db.exec(await readFile('supabase/migrations/001_workspace.sql','utf8'));
  await db.query('insert into auth.users values ($1)',[owner]);await db.query('insert into public.workspace_owner values ($1)',[owner]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.query('select public.load_workspace()');
  const legacy=seed().map(({status,deliverable,completionCriteria,nextAction,...n},i)=>({...n,completed:i===1}));
  await db.query('select public.save_workspace(0,$1::jsonb)',[JSON.stringify(legacy)]);
  await db.exec(await readFile('supabase/migrations/002_objective_progress.sql','utf8'));
  const read=async()=> (await db.query<{data:{schemaVersion:number;revision:number;nodes:ReturnType<typeof seed>}}>('select public.load_workspace() as data')).rows[0].data;
  const migrated=await read();assert.equal(migrated.schemaVersion,2);assert.equal(migrated.revision,2);
  for(const n of migrated.nodes){const old=legacy.find(x=>x.id===n.id)!;assert.equal(n.status,old.completed?'Complete':'Not started');assert.equal(n.title,old.title);assert.equal(n.description,old.description);assert.equal(n.position,old.position);assert.equal(n.parentId,old.parentId);assert.equal(Date.parse(n.createdAt),Date.parse(old.createdAt));}
  await assert.rejects(db.query('select public.save_workspace(2,$1::jsonb)',[JSON.stringify(legacy)]),/refresh Mandaloom/);
  const edited=migrated.nodes.map((n,i)=>({...n,status: ['Blocked','In progress','Complete','Not started'][i%4],deliverable:'Research report',completionCriteria:'Reviewed\nApproved',nextAction:'Gather data'}));
  await db.query('select public.save_workspace(2,$1::jsonb)',[JSON.stringify(edited)]);
  for(const n of (await read()).nodes){const expected=edited.find(x=>x.id===n.id)!;assert.equal(n.status,expected.status);assert.equal(n.deliverable,expected.deliverable);assert.equal(n.completionCriteria,expected.completionCriteria);assert.equal(n.nextAction,expected.nextAction);}
 }finally{await db.close();}
});
