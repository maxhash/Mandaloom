import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {backup,parseBackup,seed,dueLabel,type Objective} from '../src/lib/model';
import {toolSpecs} from '../src/lib/mcp/tools';
test('planning defaults, backup roundtrip, calendar validation and local date labels',()=>{
 const nodes=seed();const legacy=nodes.map(({dueDate,priority,...n})=>n);assert.equal(parseBackup({...backup(nodes),nodes:legacy})[0].priority,'Normal');
 nodes[0].dueDate='2028-02-29';nodes[0].priority='High';assert.deepEqual(parseBackup(backup(nodes)),nodes);
 for(const dueDate of ['2027-02-29','2026-04-31','0000-01-01','2026-13-01','tomorrow'])assert.throws(()=>parseBackup(backup([{...nodes[0],dueDate}])));
 assert.throws(()=>parseBackup(backup([{...nodes[0],priority:'Urgent'} as unknown as Objective])));
 const today=new Date(2026,10,6,12);assert.equal(dueLabel('2026-11-06','Blocked',today),'Due today');assert.equal(dueLabel('2026-11-05','In progress',today),'Overdue');assert.equal(dueLabel('2026-11-05','Complete',today),'Due 2026-11-05');
 const args={expectedRevision:1,requestId:crypto.randomUUID(),nodeId:nodes[0].id,fields:{dueDate:'2028-02-29',priority:'High'}};assert.ok(toolSpecs.update_objective.schema.safeParse(args).success);assert.ok(!toolSpecs.update_objective.schema.safeParse({...args,fields:{dueDate:'2027-02-29'}}).success);
});
test('planning migration preserves content and roundtrips root and nested fields, including old clients',async()=>{
 const db=new PGlite(),owner=crypto.randomUUID();try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role supabase_auth_admin;create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;`);
 for(const name of ['001_workspace','002_objective_progress','003_private_plugin','004_grid_references'])await db.exec(await readFile('supabase/migrations/'+name+'.sql','utf8'));
 await db.query('insert into auth.users values($1)',[owner]);await db.query('insert into public.workspace_owner values($1)',[owner]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.query('select public.load_workspace()');
 await db.query('select public.save_workspace(0,$1::jsonb)',[JSON.stringify(seed())]);
 const read=async()=> (await db.query<{data:{revision:number;planningVersion:number;nodes:Objective[]}}>('select public.load_workspace() as data')).rows[0].data;
 const before=await read();await db.exec(await readFile('supabase/migrations/005_objective_planning.sql','utf8'));let snapshot=await read();assert.equal(snapshot.planningVersion,1);assert.equal(snapshot.revision,before.revision+1);
 for(const n of snapshot.nodes){assert.equal(n.dueDate,'');assert.equal(n.priority,'Normal');const old=before.nodes.find(x=>x.id===n.id)!;assert.equal(n.description,old.description);assert.equal(n.referenceNumber,old.referenceNumber);assert.equal(n.status,old.status);}
 const save=async(nodes:unknown[])=>{await db.query('select public.save_workspace($1,$2::jsonb)',[snapshot.revision,JSON.stringify(nodes)]);snapshot=await read();};
 await save(snapshot.nodes.map(n=>({...n,dueDate:'2028-02-29',priority:n.parentId?'Low':'High'})));
 assert.ok(snapshot.nodes.every(n=>n.dueDate==='2028-02-29'));assert.equal(snapshot.nodes.find(n=>!n.parentId)!.priority,'High');
 await save(snapshot.nodes.map(({dueDate,priority,...n})=>n));assert.ok(snapshot.nodes.every(n=>n.dueDate==='2028-02-29'));
 for(const fields of [{dueDate:'2027-02-29'},{priority:'Urgent'}])await assert.rejects(save(snapshot.nodes.map(n=>({...n,...fields}))));
 await save(snapshot.nodes.map(n=>({...n,dueDate:'',priority:'Normal'})));assert.ok(snapshot.nodes.every(n=>n.dueDate===''&&n.priority==='Normal'));
 }finally{await db.close();}
});
