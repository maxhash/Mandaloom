import type {Objective} from './model';
// Permanent IDs keep bookmarks stable across renaming and position swaps.
export function gridHref(id:string){return id?'/?grid='+encodeURIComponent(id):'/';}
export function resolveGrid(nodes:Objective[],requested:string|null){const found=requested?nodes.find(n=>n.id===requested):undefined;return {id:found?.id??nodes.find(n=>!n.parentId)?.id??'',missing:requested!==null&&!found};}
