export const statuses = ['Not started', 'In progress', 'Blocked', 'Complete'] as const;
export type ObjectiveStatus = typeof statuses[number];
export type Objective = { id: string; parentId: string | null; rootId: string; position: number; title: string; description: string; deliverable: string; completionCriteria: string; status: ObjectiveStatus; nextAction: string; createdAt: string; updatedAt: string; referenceNumber?:number; nextChildNumber?:number };
export type Backup = { format: 'mandaloom'; version: 3; nodes: Objective[]; nextRootNumber:number };
export const positions = [0,1,2,3,5,6,7,8];
export function makeNode(title: string, parent?: Objective, position = 4): Objective { const id = crypto.randomUUID(), now = new Date().toISOString(); return { id, parentId: parent?.id ?? null, rootId: parent?.rootId ?? id, position, title, description: '', deliverable: '', completionCriteria: '', status: 'Not started', nextAction: '', createdAt: now, updatedAt: now }; }
export function seed(): Objective[] { const root = makeNode('Establish and Operate a Profitable Proprietary Trading Firm'); root.description = 'Build a durable trading business through disciplined research, controlled risk and consistent execution.'; return [root, ...['Trading Strategy','Research & Analytics','Risk Management','Capital & Funding','Legal & Compliance','Technology & Data','Operations','Performance & Growth'].map((title,i) => makeNode(title,root,positions[i]))]; }
export function descendants(nodes: Objective[], id: string): Set<string> { const children = new Map<string,Objective[]>(); for (const n of nodes) if(n.parentId) children.set(n.parentId,[...(children.get(n.parentId) ?? []),n]); const found = new Set<string>(), queue = [id]; while(queue.length) { const x = queue.pop()!; if(found.has(x)) continue; found.add(x); for(const n of children.get(x) ?? []) queue.push(n.id); } return found; }
export function trail(nodes: Objective[], id: string): Objective[] { const map = new Map(nodes.map(n=>[n.id,n])), result: Objective[] = [], seen = new Set<string>(); let n = map.get(id); while(n && !seen.has(n.id)) { result.push(n); seen.add(n.id); n = n.parentId ? map.get(n.parentId) : undefined; } return result.reverse(); }
// Reference numbers belong to objectives, not grid positions. Parent counters
// retain deleted children's numbers; the workspace counter retains deleted roots.
export function assignReferences(nodes:Objective[],nextRootNumber=1):{nodes:Objective[];nextRootNumber:number} {
 const counters=new Map<string|null,number>([[null,nextRootNumber]]);
 for(const n of nodes){counters.set(n.id,Math.max(counters.get(n.id)??1,n.nextChildNumber??1));if(n.referenceNumber)counters.set(n.parentId,Math.max(counters.get(n.parentId)??1,n.referenceNumber+1));}
 const assigned=new Map<string,number>();
 const groups=new Map<string|null,Objective[]>();
 for(const n of nodes){const group=groups.get(n.parentId);if(group)group.push(n);else groups.set(n.parentId,[n]);}
 for(const [parent,group] of groups){group.sort((a,b)=>parent===null?a.createdAt.localeCompare(b.createdAt):a.position-b.position);for(const n of group){const number=n.referenceNumber??counters.get(parent)??1;if(number>=2147483647)throw Error('Reference number capacity reached.');assigned.set(n.id,number);counters.set(parent,Math.max(counters.get(parent)??1,number+1));}}
 return {nodes:nodes.map(n=>({...n,referenceNumber:assigned.get(n.id)!,nextChildNumber:counters.get(n.id)??1})),nextRootNumber:counters.get(null)??nextRootNumber};
}
export function referenceLookup(nodes:Objective[]){
 const byId=new Map(nodes.map(n=>[n.id,n]));
 return (id:string)=>{
  const node=byId.get(id);if(!node)return undefined;
  const segments:number[]=[];const seen=new Set<string>();let current:Objective|undefined=node;
  while(current?.parentId){if(seen.has(current.id)||!current.referenceNumber)return undefined;seen.add(current.id);segments.push(current.referenceNumber);current=byId.get(current.parentId);}
  if(!current?.referenceNumber)return undefined;
  const short='R'+segments.reverse().map(n=>'.'+n).join('');
  return {reference:short,fullReference:`M${String(current.referenceNumber).padStart(3,'0')}/${short}`,depth:segments.length};
 };
}
export function hierarchyRows(nodes: Objective[], query = '',searchText?:(node:Objective)=>string): {node: Objective; depth: number}[] {
 const children = new Map<string | null, Objective[]>();
 const byId = new Map(nodes.map(n => [n.id, n]));
 for (const node of nodes) {
  const siblings = children.get(node.parentId);
  if (siblings) siblings.push(node); else children.set(node.parentId, [node]);
 }
 for (const [parent, siblings] of children) siblings.sort((a,b) => parent === null ? ((a.referenceNumber??0)-(b.referenceNumber??0)) || a.createdAt.localeCompare(b.createdAt) : a.position-b.position);
 const search = query.trim().toLowerCase();
 const visible = new Set<string>();
 if (search) for (const node of nodes) {
  if (!(node.title+' '+(searchText?.(node)??'')).toLowerCase().includes(search)) continue;
  let ancestor: Objective | undefined = node;
  while (ancestor && !visible.has(ancestor.id)) {
   visible.add(ancestor.id);
   ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
  }
 }
 const rows: {node: Objective; depth: number}[] = [];
 const pending = (children.get(null) ?? []).map(node => ({node,depth:0})).reverse();
 const visited = new Set<string>();
 while (pending.length) {
  const row = pending.pop()!;
  if (visited.has(row.node.id) || (search && !visible.has(row.node.id))) continue;
  visited.add(row.node.id); rows.push(row);
  const nested = children.get(row.node.id) ?? [];
  for (let i=nested.length-1;i>=0;i--) pending.push({node:nested[i],depth:row.depth+1});
 }
 return rows;
}
export function parseBackup(value: unknown): Objective[] {
 if(!value || typeof value !== 'object') throw Error('Invalid backup.');
 const input = value as {format?: string; version?: number; nodes?: unknown[];nextRootNumber?:number};
 if(input.format !== 'mandaloom' || ![1,2,3].includes(input.version ?? 0) || !Array.isArray(input.nodes)) throw Error('Unsupported backup format or version.');
 if(input.nextRootNumber!==undefined && (!Number.isInteger(input.nextRootNumber)||input.nextRootNumber<1||input.nextRootNumber>2147483647))throw Error('Invalid root reference counter.');
 // The same normalization handles old exports, browser storage, recovery drafts and RPC rows.
 const data = {nodes: input.nodes.map(raw => {
  if(!raw || typeof raw !== 'object') throw Error('Invalid objective.');
  const n = raw as Objective & {completed?: boolean};
  for(const field of ['referenceNumber','nextChildNumber'] as const)if(n[field]!==undefined&&(!Number.isInteger(n[field])||n[field]!<1||n[field]!>2147483647))throw Error('Invalid objective reference number.');
  if(n.completed !== undefined && typeof n.completed !== 'boolean') throw Error('Invalid legacy completion state.');
  if(n.status !== undefined && !statuses.includes(n.status)) throw Error('Invalid objective status.');
  for(const [field,limit] of [['deliverable',1000],['completionCriteria',20000],['nextAction',1000]] as const) {
   if(n[field] !== undefined && (typeof n[field] !== 'string' || n[field].length > limit)) throw Error(`Invalid ${field}.`);
  }
  const {completed, ...rest} = n;
  return {...rest, status:n.status ?? (completed === true ? 'Complete' : 'Not started'), deliverable:n.deliverable ?? '', completionCriteria:n.completionCriteria ?? '', nextAction:n.nextAction ?? ''} as Objective;
 })};
 const map = new Map<string,Objective>(), slots = new Set<string>(), references=new Set<string>();
 const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 for(const n of data.nodes) {
  if(!n || !uuid.test(n.id) || !uuid.test(n.rootId) || (n.parentId !== null && (typeof n.parentId !== 'string' || !uuid.test(n.parentId))) || map.has(n.id) || typeof n.title !== 'string' || !n.title.trim() || n.title.length > 300 || typeof n.description !== 'string' || n.description.length > 20000 || !Number.isInteger(n.position) || !Number.isFinite(Date.parse(n.createdAt)) || !Number.isFinite(Date.parse(n.updatedAt))) throw Error('Backup contains invalid or duplicate objectives.');
  if(n.parentId === null ? n.position !== 4 || n.rootId !== n.id : !positions.includes(n.position)) throw Error('Invalid grid position.');
  const slot = `${n.parentId}:${n.position}`; if(n.parentId && slots.has(slot)) throw Error('Two objectives occupy the same cell.'); slots.add(slot); map.set(n.id,n);
  if(n.referenceNumber){const key=`${n.parentId}:${n.referenceNumber}`;if(references.has(key))throw Error('Duplicate objective reference.');references.add(key);}
 }
 const visited = new Set<string>();
 for(const start of data.nodes) { let n: Objective | undefined = start; const path = new Set<string>(); while(n && !visited.has(n.id)) { if(path.has(n.id)) throw Error('Backup contains a cycle.'); path.add(n.id); if(n.parentId) { const parent: Objective | undefined = map.get(n.parentId); if(!parent || parent.rootId !== n.rootId) throw Error('Missing parent or inconsistent root.'); n = parent; } else n = undefined; } for(const id of path) visited.add(id); }
 return data.nodes.map(n=>({...n}));
}
export function backup(nodes: Objective[],nextRootNumber=1): Backup { return {format:'mandaloom',version:3,nodes,nextRootNumber:nodes.reduce((next,n)=>n.parentId?next:Math.max(next,(n.referenceNumber??0)+1),nextRootNumber)}; }
export function importNodes(existing: Objective[], incoming: Objective[]): Objective[] { const ids = new Map(incoming.map(n=>[n.id,crypto.randomUUID()])); return [...existing,...incoming.map(n=>({...n,id:ids.get(n.id)!,parentId:n.parentId ? ids.get(n.parentId)! : null,rootId:ids.get(n.rootId)!,referenceNumber:n.parentId?n.referenceNumber:undefined}))]; }
