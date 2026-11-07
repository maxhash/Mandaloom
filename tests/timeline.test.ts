import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNode} from '../src/lib/model';
import {timelineDate,timelineGroups} from '../src/lib/timeline';

test('timeline includes every depth and status, orders real dates first and keeps undated objectives',()=>{
 const root=makeNode('Root'),late=makeNode('Later',root,0),early=makeNode('Earlier',root,1),deep=makeNode('Nested completed task',late,0);
 late.dueDate='2027-01-02';early.dueDate='2026-12-31';deep.dueDate=early.dueDate;deep.status='Complete';
 const nodes=[early,deep,root,late],snapshot=JSON.stringify(nodes);
 const groups=timelineGroups(nodes);
 assert.deepEqual(groups.map(g=>g.date),['2026-12-31','2027-01-02','']);
 assert.deepEqual(groups[0].nodes.map(n=>n.title),['Nested completed task','Earlier']);
 assert.equal(groups[2].nodes[0].id,root.id);
 assert.equal(groups.flatMap(g=>g.nodes).length,nodes.length);
 assert.equal(JSON.stringify(nodes),snapshot);
});

test('current-Mandala scope includes the complete root and descendants, excluding other roots',()=>{
 const one=makeNode('One'),two=makeNode('Two'),child=makeNode('Child',one,0),deep=makeNode('Deep',child,0);
 const nodes=[two,deep,child,one];
 assert.deepEqual(new Set(timelineGroups(nodes,one.id).flatMap(g=>g.nodes.map(n=>n.id))),new Set([one.id,child.id,deep.id]));
 assert.equal(timelineGroups(nodes).flatMap(g=>g.nodes).length,4);
 assert.deepEqual(timelineGroups([]),[]);
});

test('date headings preserve the saved calendar date and identify unscheduled objectives',()=>{
 assert.equal(timelineDate(''),'Unscheduled');
 assert.equal(timelineDate('2026-01-01'),'1 Jan 2026');
 assert.equal(timelineDate('2028-02-29'),'29 Feb 2028');
});
