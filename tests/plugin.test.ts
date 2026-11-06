import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignReferences,makeNode,seed,type Objective} from '../src/lib/model';
import {executeTool,type Snapshot,type WorkspaceRepository} from '../src/lib/mcp/tools';
import {checkPluginClaims,AuthenticationError} from '../src/lib/mcp/repository';
import {authorizationServer,MCP_RESOURCE} from '../src/lib/mcp/config';
import {handleMcpRequest} from '../src/lib/mcp/server';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

function repository(nodes=seed()):WorkspaceRepository & {snapshot:Snapshot} {
 nodes=assignReferences(nodes).nodes;
 const receipts=new Map<string,{fingerprint:string;result:Record<string,unknown>}>();
 const repo={connection:{ownerId:crypto.randomUUID(),permissions:['read','write']},snapshot:{schemaVersion:2,revision:4,nodes},
  async load(){return structuredClone(repo.snapshot);},
  async receipt(id:string,fingerprint:string){const receipt=receipts.get(id);if(receipt&&receipt.fingerprint!==fingerprint)throw Error('Request ID reused');return receipt?.result??null;},
  async commit(revision:number,next:Objective[],id:string,fingerprint:string,result:Record<string,unknown>){const receipt=await repo.receipt(id,fingerprint);if(receipt)return receipt;if(revision!==repo.snapshot.revision)throw Error('Save conflict');repo.snapshot={...repo.snapshot,nodes:next,revision:revision+1};const stored={...result,revision:revision+1};receipts.set(id,{fingerprint,result:stored});return stored;},
 };return repo;
}
test('OAuth discovery normalizes pasted environment values before forming the issuer',()=>{
 const original=process.env.NEXT_PUBLIC_SUPABASE_URL;
 try{process.env.NEXT_PUBLIC_SUPABASE_URL=' https://project.supabase.co/\r\n';assert.equal(authorizationServer(),'https://project.supabase.co/auth/v1');}
 finally{if(original===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=original;}
});
test('plugin fills only empty cells atomically and edits nested objectives without changing hierarchy',async()=>{
 const repo=repository();const parent=repo.snapshot.nodes[1];const original=structuredClone(repo.snapshot.nodes);
 const result=await executeTool('populate_grid',{expectedRevision:4,requestId:crypto.randomUUID(),parentId:parent.id,objectives:[{position:0,fields:{title:'Approach',deliverable:'Report'}},{position:1,fields:{title:'Research',status:'In progress'}}]},repo);
 assert.equal(result.revision,5);assert.deepEqual(repo.snapshot.nodes.slice(0,9).map(({nextChildNumber,...n})=>n),original.map(({nextChildNumber,...n})=>n));
 const child=repo.snapshot.nodes[9];assert.equal(child.parentId,parent.id);assert.equal(child.rootId,parent.rootId);assert.equal(child.status,'Not started');
 assert.equal((result.objectives as {fullReference:string}[])[0].fullReference,'M001/R.1.1');
 const located=await executeTool('search_objectives',{query:'M001/R.1.1'},repo);assert.equal(located.total,1);
 await executeTool('create_objective',{expectedRevision:5,requestId:crypto.randomUUID(),parentId:child.id,position:0,fields:{title:'Task'}},repo);
 const descendant=repo.snapshot.nodes.at(-1)!;
 await executeTool('update_objective',{expectedRevision:6,requestId:crypto.randomUUID(),nodeId:child.id,fields:{title:'Updated approach',completionCriteria:'Reviewed\nApproved',nextAction:'Run research',status:'Blocked'}},repo);
 const edited=repo.snapshot.nodes.find(n=>n.id===child.id)!;assert.equal(edited.deliverable,'Report');assert.equal(edited.parentId,parent.id);assert.equal(edited.position,0);assert.deepEqual(repo.snapshot.nodes.at(-1),descendant);
 const grid=await executeTool('get_grid',{nodeId:child.id},repo);assert.equal((grid.children as Objective[])[0].id,descendant.id);
 const before=structuredClone(repo.snapshot);
 await assert.rejects(executeTool('populate_grid',{expectedRevision:7,requestId:crypto.randomUUID(),parentId:parent.id,objectives:[{position:2,fields:{title:'New'}},{position:0,fields:{title:'Occupied'}}]},repo),/occupied/);
 assert.deepEqual(repo.snapshot,before);
 await assert.rejects(executeTool('populate_grid',{expectedRevision:7,requestId:crypto.randomUUID(),parentId:parent.id,objectives:[{position:2,fields:{title:'New'}},{position:2,fields:{title:'Duplicate'}}]},repo),/occupied/);
 assert.deepEqual(repo.snapshot,before);
});
test('writes are idempotent, reject stale revisions, missing parents and hierarchy injection',async()=>{
 const repo=repository(), args={expectedRevision:4,requestId:crypto.randomUUID(),parentId:null,fields:{title:'New root'}};
 const first=await executeTool('create_objective',args,repo);assert.deepEqual(await executeTool('create_objective',args,repo),first);assert.equal(repo.snapshot.nodes.length,10);
 await assert.rejects(executeTool('create_objective',{...args,fields:{title:'Different'}},repo),/reused/);
 await assert.rejects(executeTool('create_objective',{...args,requestId:crypto.randomUUID()},repo),/Workspace changed/);
 await assert.rejects(executeTool('create_objective',{...args,expectedRevision:5,requestId:crypto.randomUUID(),parentId:crypto.randomUUID(),position:0},repo),/not found/);
 await assert.rejects(executeTool('update_objective',{expectedRevision:5,requestId:crypto.randomUUID(),nodeId:repo.snapshot.nodes[0].id,fields:{parentId:crypto.randomUUID()}},repo));
 await assert.rejects(executeTool('create_objective',{...args,expectedRevision:5,requestId:crypto.randomUUID(),position:4},repo));
 repo.connection.permissions=['read'];await assert.rejects(executeTool('create_objective',{...args,expectedRevision:5,requestId:crypto.randomUUID()},repo),/permission/);
});
test('reads are paginated, disambiguated and revision-consistent',async()=>{
 const repo=repository();const root=repo.snapshot.nodes[0];
 const result=await executeTool('get_subtree',{nodeId:root.id,limit:2},repo);assert.equal(result.nextOffset,2);assert.equal((result.nodes as Objective[]).length,2);
 await assert.rejects(executeTool('get_subtree',{nodeId:root.id,revision:0},repo),/between pages/);
 const found=await executeTool('search_objectives',{query:'Trading Strategy'},repo);assert.equal(found.total,1);assert.equal((found.results as {path:unknown[]}[])[0].path.length,2);
 const connection=await executeTool('get_connection',{},repo);assert.equal(connection.ownerId,repo.connection.ownerId);
});
test('tokens must be resource-bound, unexpired OAuth tokens with approved claims',()=>{
 const issuer='https://project.supabase.co/auth/v1';
 const claims={iss:issuer,aud:'authenticated',sub:crypto.randomUUID(),role:'authenticated',exp:2000,client_id:crypto.randomUUID(),resource:MCP_RESOURCE,mandaloom_grant:crypto.randomUUID(),mandaloom_permissions:['read','write']};
 assert.equal(checkPluginClaims(claims,issuer,1000).ownerId,claims.sub);
 for(const patch of [{resource:'https://other.example/mcp'},{iss:'https://attacker.example'},{aud:'other'},{exp:999},{client_id:undefined},{mandaloom_permissions:[]},{mandaloom_grant:undefined},{nbf:3000}])assert.throws(()=>checkPluginClaims({...claims,...patch},issuer,1000),AuthenticationError);
});
test('MCP discovery is public but tool data needs authorization and hostile origins are denied',async()=>{
 const request=(body:unknown,origin?:string)=>new Request('http://localhost:3000/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
 const response=await handleMcpRequest(request({jsonrpc:'2.0',id:1,method:'tools/list'}));
 assert.equal(response.status,200);const list=await response.json();assert.equal(list.result.tools.length,9);assert.equal(list.result.tools.find((t:{name:string})=>t.name==='populate_grid').annotations.readOnlyHint,false);
 const denied=await handleMcpRequest(request({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'list_mandalas',arguments:{}}}));const error=await denied.json();assert.equal(error.result.isError,true);assert.ok(error.result._meta['mcp/www_authenticate']);
 const blocked=await handleMcpRequest(request({jsonrpc:'2.0',id:1,method:'tools/list'},'https://attacker.example'));assert.equal(blocked.status,403);
 const repo=repository();const allowed=await handleMcpRequest(request({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'list_mandalas',arguments:{}}}),async()=>repo);const data=await allowed.json();assert.equal(data.result.structuredContent.mandalas.length,1);
});
test('official MCP client completes initialization, discovery and a round-trip write/read',async()=>{
 const repo=repository();const client=new Client({name:'mandaloom-test',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'),{fetch:async(input,init)=>handleMcpRequest(new Request(input,init),async()=>repo)});
 try{
  await client.connect(transport);const list=await client.listTools();assert.equal(list.tools.length,9);
  const result=await client.callTool({name:'create_objective',arguments:{expectedRevision:4,requestId:crypto.randomUUID(),parentId:null,fields:{title:'MCP test'}}});assert.equal(result.isError,undefined);assert.equal((result.structuredContent as {revision:number}).revision,5);
  const roots=await client.callTool({name:'list_mandalas',arguments:{}});assert.equal((roots.structuredContent as {mandalas:unknown[]}).mandalas.length,2);
 }finally{await client.close();}
});

test('plugin grid, root, breadcrumb and mutation results include permanent browser links',async()=>{const repo=repository();const root=repo.snapshot.nodes[0];const roots=await executeTool('list_mandalas',{},repo);assert.equal((roots.mandalas as {url:string}[])[0].url,'https://mandaloom.vercel.app/m/M001/R');const grid=await executeTool('get_grid',{nodeId:root.id},repo);assert.equal((grid.centre as {url:string}).url,(roots.mandalas as {url:string}[])[0].url);assert.equal((grid.path as {url:string}[])[0].url,(grid.centre as {url:string}).url);const created=await executeTool('create_objective',{expectedRevision:4,requestId:crypto.randomUUID(),parentId:null,fields:{title:'Linked root'}},repo);const n=(created.objectives as {id:string;url:string}[])[0];assert.equal(n.url,'https://mandaloom.vercel.app/m/M002/R');});
