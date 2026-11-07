import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assignReferences,makeNode,seed} from '../src/lib/model';
import {findReferences,referenceParts,resolveReference} from '../src/lib/references';

test('finds relative and full grid references in free text',()=>{
 const found=findReferences('Filter for R.1.6 rather than M002/R.3 or M001/R. Not R, R.0, AR.1, R.1x or v1.R.2.');
 assert.deepEqual(found.map(f=>f.text),['R.1.6','M002/R.3','M001/R']);
 assert.deepEqual(found[0],{start:11,end:16,text:'R.1.6',mandala:undefined,segments:[1,6]});
 assert.deepEqual(found[1].segments,[3]);assert.equal(found[1].mandala,2);
 assert.deepEqual(findReferences('See R.1.6.').map(f=>f.text),['R.1.6']);
});

test('resolves references inside the current Mandala or a named one',()=>{
 let state=assignReferences(seed());const root=state.nodes[0],strategy=state.nodes[1];
 const child=makeNode('Approach',strategy,0);state=assignReferences([...state.nodes,child],state.nextRootNumber);
 assert.equal(resolveReference(state.nodes,root.id,{segments:[1,1]})?.id,child.id);
 assert.equal(resolveReference(state.nodes,root.id,{mandala:1,segments:[]})?.id,root.id);
 assert.equal(resolveReference(state.nodes,root.id,{segments:[9]}),undefined);
 assert.equal(resolveReference(state.nodes,root.id,{mandala:7,segments:[1]}),undefined);
 const parts=referenceParts('Use R.1.1 and R.9 here',state.nodes,root.id);
 assert.deepEqual(parts.map(p=>[p.text,p.target?.id]),[['Use ',undefined],['R.1.1',child.id],[' and R.9 here',undefined]]);
});
