export type Objective = { id: string; parentId: string | null; rootId: string; position: number; title: string; description: string; completed: boolean; createdAt: string; updatedAt: string };
export type Backup = { format: 'mandaloom'; version: 1; nodes: Objective[] };
export const positions = [0,1,2,3,5,6,7,8];
export function makeNode(title: string, parent?: Objective, position = 4): Objective { const id = crypto.randomUUID(), now = new Date().toISOString(); return { id, parentId: parent?.id ?? null, rootId: parent?.rootId ?? id, position, title, description: '', completed: false, createdAt: now, updatedAt: now }; }
export function seed(): Objective[] { const root = makeNode('Establish and Operate a Profitable Proprietary Trading Firm'); root.description = 'Build a durable trading business through disciplined research, controlled risk and consistent execution.'; return [root, ...['Trading Strategy','Research & Analytics','Risk Management','Capital & Funding','Legal & Compliance','Technology & Data','Operations','Performance & Growth'].map((title,i) => makeNode(title,root,positions[i]))]; }
export function descendants(nodes: Objective[], id: string): Set<string> { const children = new Map<string,Objective[]>(); for (const n of nodes) if(n.parentId) children.set(n.parentId,[...(children.get(n.parentId) ?? []),n]); const found = new Set<string>(), queue = [id]; while(queue.length) { const x = queue.pop()!; if(found.has(x)) continue; found.add(x); for(const n of children.get(x) ?? []) queue.push(n.id); } return found; }
export function trail(nodes: Objective[], id: string): Objective[] { const map = new Map(nodes.map(n=>[n.id,n])), result: Objective[] = [], seen = new Set<string>(); let n = map.get(id); while(n && !seen.has(n.id)) { result.push(n); seen.add(n.id); n = n.parentId ? map.get(n.parentId) : undefined; } return result.reverse(); }
export function parseBackup(value: unknown): Objective[] {
 if(!value || typeof value !== 'object') throw Error('Invalid backup.');
 const data = value as Backup;
 if(data.format !== 'mandaloom' || data.version !== 1 || !Array.isArray(data.nodes)) throw Error('Unsupported backup format or version.');
 const map = new Map<string,Objective>(), slots = new Set<string>();
 const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 for(const n of data.nodes) {
  if(!n || !uuid.test(n.id) || !uuid.test(n.rootId) || (n.parentId !== null && (typeof n.parentId !== 'string' || !uuid.test(n.parentId))) || map.has(n.id) || typeof n.title !== 'string' || !n.title.trim() || n.title.length > 300 || typeof n.description !== 'string' || n.description.length > 20000 || typeof n.completed !== 'boolean' || !Number.isInteger(n.position) || !Number.isFinite(Date.parse(n.createdAt)) || !Number.isFinite(Date.parse(n.updatedAt))) throw Error('Backup contains invalid or duplicate objectives.');
  if(n.parentId === null ? n.position !== 4 || n.rootId !== n.id : !positions.includes(n.position)) throw Error('Invalid grid position.');
  const slot = `${n.parentId}:${n.position}`; if(n.parentId && slots.has(slot)) throw Error('Two objectives occupy the same cell.'); slots.add(slot); map.set(n.id,n);
 }
 const visited = new Set<string>();
 for(const start of data.nodes) { let n: Objective | undefined = start; const path = new Set<string>(); while(n && !visited.has(n.id)) { if(path.has(n.id)) throw Error('Backup contains a cycle.'); path.add(n.id); if(n.parentId) { const parent: Objective | undefined = map.get(n.parentId); if(!parent || parent.rootId !== n.rootId) throw Error('Missing parent or inconsistent root.'); n = parent; } else n = undefined; } for(const id of path) visited.add(id); }
 return data.nodes.map(n=>({...n}));
}
export function backup(nodes: Objective[]): Backup { return {format:'mandaloom',version:1,nodes}; }
export function importNodes(existing: Objective[], incoming: Objective[]): Objective[] { const ids = new Map(incoming.map(n=>[n.id,crypto.randomUUID()])); return [...existing,...incoming.map(n=>({...n,id:ids.get(n.id)!,parentId:n.parentId ? ids.get(n.parentId)! : null,rootId:ids.get(n.rootId)!}))]; }
