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
 await assert.rejects(save(1,nodes.map((n,i)=>i===1?{...n,parentId:crypto.randomUUID()}:n)));
 await assert.rejects(save(1,nodes.map((n,i)=>i===1?{...n,title:''}:n)));
 const cycle=nodes.map(n=>({...n}));cycle[0].parentId=cycle[1].id;cycle[0].position=1;
 await assert.rejects(save(1,cycle),/cycles/);
 assert.equal((await read()).revision,1);assert.equal((await read()).nodes.length,9);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from public.objectives'),/permission denied/);await assert.rejects(db.query('insert into public.workspace_owner values ($1)',[stranger]),/permission denied/);await db.exec('reset role');
 await save(1,[]);assert.equal((await read()).nodes.length,0);
 }finally{await db.close();}
});
