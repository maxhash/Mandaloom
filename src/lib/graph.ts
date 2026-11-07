import {positions,type Objective} from './model';

export type GraphNode={objective:Objective;x:number;y:number;depth:number;branch:number;childCount:number};
export type GraphEdge={source:string;target:string;branch:number};
export type GraphLayout={nodes:GraphNode[];edges:GraphEdge[];bounds:{minX:number;maxX:number;minY:number;maxY:number}};
export type GraphCamera={x:number;y:number;scale:number};

// A deterministic radial tree: each visible subtree receives space proportional
// to its leaf count. Collapse affects presentation only, never objective data.
export function objectiveGraph(objectives:Objective[],rootId:string,collapsed:ReadonlySet<string>=new Set()):GraphLayout{
 const children=new Map<string, Objective[]>();
 const root=objectives.find(node=>node.id===rootId&&node.parentId===null);
 if(!root)return {nodes:[],edges:[],bounds:{minX:-100,maxX:100,minY:-100,maxY:100}};
 for(const node of objectives)if(node.rootId===rootId&&node.parentId){const group=children.get(node.parentId);if(group)group.push(node);else children.set(node.parentId,[node]);}
 for(const group of children.values())group.sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
 const order:{objective:Objective;depth:number;branch:number}[]=[],seen=new Set<string>();
 const stack=[{objective:root,depth:0,branch:-1}];
 while(stack.length){const item=stack.pop()!;if(seen.has(item.objective.id))continue;seen.add(item.objective.id);order.push(item);
  if(collapsed.has(item.objective.id))continue;
  const group=children.get(item.objective.id)??[];
  for(let i=group.length-1;i>=0;i--)stack.push({objective:group[i],depth:item.depth+1,branch:item.depth===0?positions.indexOf(group[i].position):item.branch});
 }
 const weights=new Map<string,number>();
 for(let i=order.length-1;i>=0;i--){const node=order[i].objective;weights.set(node.id,collapsed.has(node.id)?1:(children.get(node.id)??[]).reduce((sum,child)=>sum+(weights.get(child.id)??0),0)||1);}
 const ranges=new Map<string,[number,number]>([[rootId,[-Math.PI/2,Math.PI*1.5]]]);
 const nodes:GraphNode[]=[],edges:GraphEdge[]=[];
 const bounds={minX:-140,maxX:140,minY:-40,maxY:70};
 for(const item of order){const {objective,depth,branch}=item;const [start,end]=ranges.get(objective.id)!;const angle=(start+end)/2,radius=depth*190;
  const x=depth?Math.cos(angle)*radius:0,y=depth?Math.sin(angle)*radius:0;
  nodes.push({objective,x,y,depth,branch,childCount:(children.get(objective.id)??[]).length});
  bounds.minX=Math.min(bounds.minX,x-150);bounds.maxX=Math.max(bounds.maxX,x+150);bounds.minY=Math.min(bounds.minY,y-30);bounds.maxY=Math.max(bounds.maxY,y+40);
  if(objective.id!==rootId)edges.push({source:objective.parentId!,target:objective.id,branch});
  if(collapsed.has(objective.id))continue;
  let cursor=start;const total=weights.get(objective.id)!;
  for(const child of children.get(objective.id)??[]){if(!weights.has(child.id))continue;const next=cursor+(end-start)*weights.get(child.id)!/total;ranges.set(child.id,[cursor,next]);cursor=next;}
 }
 return {nodes,edges,bounds};
}

export function fitGraph(bounds:GraphLayout['bounds'],width:number,height:number):GraphCamera{
 const scale=Math.max(.000001,Math.min(1.5,Math.max(1,width-60)/Math.max(1,bounds.maxX-bounds.minX),Math.max(1,height-80)/Math.max(1,bounds.maxY-bounds.minY)));
 return {scale,x:-(bounds.minX+bounds.maxX)/2*scale,y:-(bounds.minY+bounds.maxY)/2*scale};
}

export function zoomGraph(camera:GraphCamera,factor:number,anchor={x:0,y:0}):GraphCamera{
 const scale=Math.max(.000001,Math.min(4,camera.scale*factor)),ratio=scale/camera.scale;
 return {scale,x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio};
}
