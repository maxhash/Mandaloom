import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {assignReferences,backup,importNodes,makeNode,parseBackup,referenceLookup,seed,type Objective} from '../src/lib/model';

test('references show nesting and remain stable across swaps, deletion, backups and imported copies',()=>{
 let state=assignReferences(seed());let lookup=referenceLookup(state.nodes);const root=state.nodes[0],strategy=state.nodes[1];
 assert.equal(lookup(root.id)?.fullReference,'M001/R');assert.equal(lookup(strategy.id)?.reference,'R.1');
 const child=makeNode('Approach',strategy,0);state=assignReferences([...state.nodes,child],state.nextRootNumber);lookup=referenceLookup(state.nodes);assert.equal(lookup(child.id)?.fullReference,'M001/R.1.1');
 state=assignReferences(state.nodes.map(n=>n.id===strategy.id?{...n,position:1}:n.id===state.nodes[2].id?{...n,position:0}:n),state.nextRootNumber);assert.equal(referenceLookup(state.nodes)(child.id)?.reference,'R.1.1');
 state=assignReferences(state.nodes.filter(n=>n.id!==child.id),state.nextRootNumber);const replacement=makeNode('New child',strategy,0);state=assignReferences([...state.nodes,replacement],state.nextRootNumber);assert.equal(referenceLookup(state.nodes)(replacement.id)?.reference,'R.1.2');
 const exported=backup(state.nodes,state.nextRootNumber);const restored=assignReferences(parseBackup(JSON.parse(JSON.stringify(exported))),exported.nextRootNumber);assert.deepEqual(restored,state);
 const imported=assignReferences(importNodes(state.nodes,state.nodes),state.nextRootNumber);assert.equal(referenceLookup(imported.nodes)(imported.nodes[state.nodes.length].id)?.fullReference,'M002/R');assert.equal(referenceLookup(imported.nodes)(imported.nodes.at(-1)!.id)?.fullReference,'M002/R.1.2');
 const empty=assignReferences([],state.nextRootNumber);const fresh=makeNode('New root');assert.equal(referenceLookup(assignReferences([fresh],empty.nextRootNumber).nodes)(fresh.id)?.fullReference,'M002/R');
});
test('deep reference paths use iterative traversal and duplicate references are rejected',()=>{
 const nodes=[makeNode('Root')];for(let i=0;i<12000;i++)nodes.push(makeNode('Nested',nodes.at(-1),0));
 const state=assignReferences(nodes);const reference=referenceLookup(state.nodes)(nodes.at(-1)!.id)!;assert.equal(reference.depth,12000);assert.equal(reference.reference,'R'+'.1'.repeat(12000));
 const sample=assignReferences(seed()).nodes;sample[2].referenceNumber=sample[1].referenceNumber;assert.throws(()=>parseBackup(backup(sample)),/Duplicate objective reference/);
});
test('database migration preserves content, assigns stable numbers, and never reuses deleted references',async()=>{
 const db=new PGlite(),owner=crypto.randomUUID();
 try{
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role supabase_auth_admin;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
  for(const name of ['001_workspace','002_objective_progress','003_private_plugin'])await db.exec(await readFile(`supabase/migrations/${name}.sql`,'utf8'));
  await db.query('insert into auth.users values($1)',[owner]);await db.query('insert into public.workspace_owner values($1)',[owner]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.query('select public.load_workspace()');
  const original=seed();await db.query('select public.save_workspace(0,$1::jsonb)',[JSON.stringify(original)]);
  await db.exec(await readFile('supabase/migrations/004_grid_references.sql','utf8'));
  const load=async()=> (await db.query<{data:{revision:number;referenceVersion:number;nextRootNumber:number;nodes:Objective[]}}>('select public.load_workspace() as data')).rows[0].data;
  let snapshot=await load();assert.equal(snapshot.referenceVersion,1);assert.equal(snapshot.revision,2);assert.equal(snapshot.nextRootNumber,2);
  for(const n of snapshot.nodes){const before=original.find(x=>x.id===n.id)!;assert.equal(n.title,before.title);assert.equal(n.description,before.description);assert.equal(n.position,before.position);assert.equal(n.status,before.status);assert.equal(Date.parse(n.createdAt),Date.parse(before.createdAt));}
  const root=snapshot.nodes.find(n=>!n.parentId)!;const strategy=snapshot.nodes.find(n=>n.title==='Trading Strategy')!;
  assert.equal(referenceLookup(snapshot.nodes)(strategy.id)?.fullReference,'M001/R.1');
  const save=async(nodes:Objective[])=>{await db.query('select public.save_workspace($1,$2::jsonb)',[snapshot.revision,JSON.stringify(nodes)]);snapshot=await load();};
  const child=makeNode('Approach',strategy,0);await save([...snapshot.nodes,child]);assert.equal(referenceLookup(snapshot.nodes)(child.id)?.fullReference,'M001/R.1.1');
  const strategyId=strategy.id;await save(snapshot.nodes.map(n=>n.id===strategyId?{...n,position:1}:n.parentId===root.id&&n.position===1?{...n,position:0}:n));assert.equal(referenceLookup(snapshot.nodes)(child.id)?.reference,'R.1.1');
  await save(snapshot.nodes.filter(n=>n.id!==child.id));const another=makeNode('New approach',strategy,0);await save([...snapshot.nodes,another]);assert.equal(referenceLookup(snapshot.nodes)(another.id)?.reference,'R.1.2');
  // An older client that omits reference metadata cannot reset existing numbers/counters.
  await save(snapshot.nodes.map(({referenceNumber,nextChildNumber,...n})=>n));assert.equal(referenceLookup(snapshot.nodes)(another.id)?.reference,'R.1.2');
  await assert.rejects(db.query('select public.save_workspace($1,$2::jsonb)',[snapshot.revision,JSON.stringify(snapshot.nodes.map(n=>n.id===another.id?{...n,referenceNumber:1}:n))]),/cannot be changed/);
  const imported=assignReferences(importNodes(snapshot.nodes,snapshot.nodes),snapshot.nextRootNumber);await save(imported.nodes);assert.equal(referenceLookup(snapshot.nodes)(imported.nodes.find(n=>!n.parentId&&n.id!==root.id)!.id)?.fullReference,'M002/R');
  await save([]);assert.equal(snapshot.nextRootNumber,3);const fresh=makeNode('Fresh root');await save([fresh]);assert.equal(referenceLookup(snapshot.nodes)(fresh.id)?.fullReference,'M003/R');
 }finally{await db.close();}
});
