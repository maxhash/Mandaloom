import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backup, descendants, hierarchyRows, importNodes, makeNode, parseBackup, seed, trail } from '../src/lib/model';
test('seed has one root, eight distinct supporting cells and round trips losslessly',()=>{const nodes=seed();assert.equal(nodes.length,9);assert.equal(new Set(nodes.slice(1).map(n=>n.position)).size,8);assert.deepEqual(parseBackup(JSON.parse(JSON.stringify(backup(nodes)))),nodes);});
test('deep hierarchy traversal and export use no recursive JS calls',()=>{const nodes=[makeNode('Root')];for(let i=0;i<12000;i++)nodes.push(makeNode(`Level ${i}`,nodes.at(-1),0));assert.equal(trail(nodes,nodes.at(-1)!.id).length,12001);assert.equal(descendants(nodes,nodes[0].id).size,12001);assert.equal(parseBackup(backup(nodes)).length,12001);});
test('rejects orphan, duplicate slot, cycles and malformed data',()=>{const nodes=seed();assert.throws(()=>parseBackup(backup([...nodes,{...nodes[1],id:crypto.randomUUID()}])));assert.throws(()=>parseBackup(backup(nodes.map((n,i)=>i===1?{...n,parentId:crypto.randomUUID()}:n))));const a=makeNode('A'),b=makeNode('B',a,0);a.parentId=b.id;a.position=1;assert.throws(()=>parseBackup(backup([a,b])));assert.throws(()=>parseBackup({format:'other',nodes}));});
test('import remaps all references and preserves metadata without overwriting originals',()=>{const nodes=seed(), imported=importNodes(nodes,parseBackup(backup(nodes)));assert.equal(imported.length,18);assert.deepEqual(imported.slice(0,9),nodes);assert.notEqual(imported[9].id,nodes[0].id);assert.equal(imported[10].parentId,imported[9].id);assert.equal(imported[10].rootId,imported[9].id);assert.equal(imported[10].createdAt,nodes[1].createdAt);parseBackup(backup(imported));});
test('legacy exports and missing completion flags migrate without changing content or hierarchy',()=>{
 const legacy=seed().map(({status,deliverable,completionCriteria,nextAction,...n},i)=>({...n,...(i===2?{}:{completed:i===1})}));
 const upgraded=parseBackup({format:'mandaloom',version:1,nodes:legacy});
 upgraded.forEach((n,i)=>{assert.equal(n.status,i===1?'Complete':'Not started');assert.equal(n.deliverable,'');assert.equal(n.completionCriteria,'');assert.equal(n.nextAction,'');assert.equal(n.id,legacy[i].id);assert.equal(n.position,legacy[i].position);assert.equal(n.description,legacy[i].description);});
 assert.deepEqual(parseBackup(backup(upgraded)),upgraded);
});
test('new fields round-trip and invalid progress values are rejected',()=>{
 const n={...makeNode('Plan'),status:'Blocked' as const,deliverable:'Report',completionCriteria:'Reviewed\nApproved',nextAction:'Collect data'};
 assert.deepEqual(parseBackup(backup([n])),[n]);
 assert.throws(()=>parseBackup({format:'mandaloom',version:2,nodes:[{...n,status:'Unknown'}]}));
 assert.throws(()=>parseBackup({format:'mandaloom',version:2,nodes:[{...n,nextAction:42}]}));
 assert.throws(()=>parseBackup({format:'mandaloom',version:2,nodes:[{...n,deliverable:'x'.repeat(1001)}]}));
});
test('hierarchy groups late-created descendants with their actual parents in grid order',()=>{
 const nodes=seed(), strategy=nodes[1];
 const approach=makeNode('Trading Approach',strategy,0), nested=makeNode('Rules',approach,0), later=makeNode('Later cell',strategy,8);
 const input=[...nodes,later,approach,nested]; const snapshot=JSON.stringify(input);
 const rows=hierarchyRows(input);
 assert.deepEqual(rows.slice(0,6).map(r=>r.node.title),[nodes[0].title,'Trading Strategy','Trading Approach','Rules','Later cell','Research & Analytics']);
 assert.deepEqual(rows.slice(0,6).map(r=>r.depth),[0,1,2,3,2,1]);
 assert.deepEqual(hierarchyRows(input,'approach').map(r=>r.node.id),[nodes[0].id,strategy.id,approach.id]);
 assert.equal(JSON.stringify(input),snapshot);
 const swapped=input.map(n=>n.id===approach.id?{...n,position:8}:n.id===later.id?{...n,position:0}:n);
 assert.deepEqual(hierarchyRows(swapped).slice(2,5).map(r=>r.node.id),[later.id,approach.id,nested.id]);
});
test('hierarchy supports deep trees without recursive calls and keeps separate roots separate',()=>{
 const first=makeNode('First'), second=makeNode('Second');const nodes=[first,second];let parent=first;
 for(let i=0;i<12000;i++){parent=makeNode(`Nested ${i}`,parent,0);nodes.push(parent);}
 const rows=hierarchyRows(nodes);assert.equal(rows.length,12002);assert.equal(rows[12000].depth,12000);assert.equal(rows.at(-1)!.node.id,second.id);
});
