import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNode} from '../src/lib/model';
import {fitGraph,objectiveGraph,zoomGraph} from '../src/lib/graph';

test('radial graph uses only real parent links and keeps branch colours across nesting and input order',()=>{
 const root=makeNode('Root'),one=makeNode('One',root,0),two=makeNode('Two',root,8),deep=makeNode('Deep',one,0),other=makeNode('Other');
 const nodes=[root,one,two,deep,other],original=JSON.stringify(nodes),layout=objectiveGraph(nodes,root.id);
 assert.equal(layout.nodes.length,4);assert.equal(layout.edges.length,3);
 assert.deepEqual(new Set(layout.edges.map(edge=>edge.source+':'+edge.target)),new Set([root.id+':'+one.id,root.id+':'+two.id,one.id+':'+deep.id]));
 assert.equal(layout.nodes.find(n=>n.objective.id===deep.id)!.branch,layout.nodes.find(n=>n.objective.id===one.id)!.branch);
 assert.notEqual(layout.nodes.find(n=>n.objective.id===one.id)!.branch,layout.nodes.find(n=>n.objective.id===two.id)!.branch);
 assert.deepEqual(objectiveGraph([...nodes].reverse(),root.id),layout);
 assert.equal(JSON.stringify(nodes),original);
});

test('collapsing a branch hides descendants without losing their data or inventing edges',()=>{
 const root=makeNode('Root'),child=makeNode('Child',root,0),deep=makeNode('Deep',child,0);
 const nodes=[root,child,deep],collapsed=objectiveGraph(nodes,root.id,new Set([child.id]));
 assert.deepEqual(collapsed.nodes.map(n=>n.objective.id),[root.id,child.id]);
 assert.equal(collapsed.nodes[1].childCount,1);assert.equal(collapsed.edges.length,1);
 assert.equal(objectiveGraph(nodes,root.id,new Set([root.id])).nodes.length,1);
 assert.equal(objectiveGraph(nodes,root.id).nodes.length,3);
 assert.equal(objectiveGraph(nodes,'missing').nodes.length,0);
});

test('deep trees are laid out without recursive stack overflow and fitting includes all bounds',()=>{
 const nodes=[makeNode('Root')];for(let i=0;i<3000;i++)nodes.push(makeNode('Level '+i,nodes.at(-1),0));
 const graph=objectiveGraph(nodes,nodes[0].id);assert.equal(graph.nodes.length,3001);
 assert.ok(graph.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
 const width=900,height=600,camera=fitGraph(graph.bounds,width,height);
 for(const x of [graph.bounds.minX,graph.bounds.maxX])assert.ok(Math.abs(x*camera.scale+camera.x)<=width/2);
 for(const y of [graph.bounds.minY,graph.bounds.maxY])assert.ok(Math.abs(y*camera.scale+camera.y)<=height/2);
});

test('zoom preserves the point under the cursor and respects usable scale limits',()=>{
 const camera={x:30,y:-20,scale:.8},anchor={x:120,y:40},next=zoomGraph(camera,1.5,anchor);
 assert.ok(Math.abs((anchor.x-camera.x)/camera.scale-(anchor.x-next.x)/next.scale)<1e-10);
 assert.ok(Math.abs((anchor.y-camera.y)/camera.scale-(anchor.y-next.y)/next.scale)<1e-10);
 assert.equal(zoomGraph(camera,1e9).scale,4);assert.ok(zoomGraph(camera,1e-9).scale>0);
});
