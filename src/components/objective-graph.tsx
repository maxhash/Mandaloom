'use client';
import {useEffect,useMemo,useRef,useState,type KeyboardEvent,type PointerEvent} from 'react';
import {Expand,Minus,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ReferenceText} from '@/components/ui/reference-preview';
import {positions,referenceLookup,trail,type Objective} from '@/lib/model';
import {fitGraph,objectiveGraph,zoomGraph,type GraphCamera} from '@/lib/graph';

const palette=['#8da866','#73a7bc','#bd8ca5','#ccaa68','#9299cd','#70b29c','#b58e6e','#aaab68'];
const shorten=(text:string,length=25)=>text.length>length?text.slice(0,length-1)+'…':text;
type Props={nodes:Objective[];rootId:string;current:string;onSelect:(id:string)=>void;onOpen:(id:string)=>void;onEdit:(node:Objective)=>void};

export function ObjectiveGraph({nodes,rootId,current,onSelect,onOpen,onEdit}:Props){
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set()),[labels,setLabels]=useState(true);
 const [size,setSize]=useState({width:800,height:600}),[camera,setCamera]=useState<GraphCamera>({x:0,y:0,scale:1});
 const surface=useRef<HTMLDivElement>(null),svg=useRef<SVGSVGElement>(null);
 const drag=useRef<{pointer:number;x:number;y:number}|null>(null);
 const layout=useMemo(()=>objectiveGraph(nodes,rootId,collapsed),[nodes,rootId,collapsed]);
 const byId=useMemo(()=>new Map(layout.nodes.map(node=>[node.objective.id,node])),[layout]);
 const references=useMemo(()=>referenceLookup(nodes),[nodes]);
 const members=useMemo(()=>nodes.filter(node=>node.rootId===rootId),[nodes,rootId]);
 const parents=useMemo(()=>new Set(members.map(node=>node.parentId)),[members]);
 const branches=members.filter(node=>node.parentId===rootId).sort((a,b)=>a.position-b.position);
 const selected=members.find(node=>node.id===current)??members.find(node=>node.id===rootId);
 const selectedChildren=selected?members.filter(node=>node.parentId===selected.id):[];
 useEffect(()=>{
  const element=surface.current;if(!element)return;
  const observer=new ResizeObserver(()=>{const rect=element.getBoundingClientRect();setSize({width:Math.max(1,rect.width),height:Math.max(1,rect.height)});});
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 useEffect(()=>{setCamera(fitGraph(layout.bounds,size.width,size.height));},[layout,size]);
 // Selecting a previously hidden objective through search, breadcrumbs or the
 // timeline reveals its ancestors while retaining the graph presentation.
 useEffect(()=>{
  const ancestors=trail(nodes,current).slice(0,-1).map(node=>node.id);
  setCollapsed(previous=>{if(!ancestors.some(id=>previous.has(id)))return previous;const next=new Set(previous);ancestors.forEach(id=>next.delete(id));return next;});
 },[current,nodes]);
 useEffect(()=>{
  const element=svg.current;if(!element)return;
  const wheel=(event:WheelEvent)=>{event.preventDefault();const rect=element.getBoundingClientRect();setCamera(previous=>zoomGraph(previous,Math.exp(-event.deltaY*.0015),{x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2}));};
  element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
 },[]);
 const fit=()=>setCamera(fitGraph(layout.bounds,size.width,size.height));
 const toggle=(id:string)=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});
 const startPan=(event:PointerEvent<SVGSVGElement>)=>{
  if(event.button!==0||(event.target as Element).closest('[data-graph-node]'))return;
  event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointer:event.pointerId,x:event.clientX,y:event.clientY};
 };
 const movePan=(event:PointerEvent<SVGSVGElement>)=>{const point=drag.current;if(!point||point.pointer!==event.pointerId)return;const dx=event.clientX-point.x,dy=event.clientY-point.y;drag.current={...point,x:event.clientX,y:event.clientY};setCamera(previous=>({...previous,x:previous.x+dx,y:previous.y+dy}));};
 const stopPan=(event:PointerEvent<SVGSVGElement>)=>{if(drag.current?.pointer!==event.pointerId)return;drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
 const viewportKeys=(event:KeyboardEvent<SVGSVGElement>)=>{
  if(event.target!==event.currentTarget)return;
  const shifts:Record<string,[number,number]>={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};
  if(shifts[event.key]){event.preventDefault();const [x,y]=shifts[event.key];setCamera(previous=>({...previous,x:previous.x+x,y:previous.y+y}));}
  else if(['+','=','-','0','Home'].includes(event.key)){event.preventDefault();if(event.key==='0'||event.key==='Home')fit();else setCamera(previous=>zoomGraph(previous,event.key==='-'?1/1.25:1.25));}
 };
 return <section className="objective-graph" aria-label="Graph view">
  <div className="graph-controls"><div className="graph-camera-controls"><button className="icon" aria-label="Zoom out" title="Zoom out" onClick={()=>setCamera(previous=>zoomGraph(previous,1/1.25))}><Minus size={17}/></button><output aria-label="Graph zoom">{Math.round(camera.scale*100)}%</output><button className="icon" aria-label="Zoom in" title="Zoom in" onClick={()=>setCamera(previous=>zoomGraph(previous,1.25))}><Plus size={17}/></button><button className="icon" aria-label="Fit graph to screen" title="Fit to screen" onClick={fit}><Expand size={17}/></button></div><div className="graph-branch-controls"><button onClick={()=>setCollapsed(new Set())}>Expand all</button><button onClick={()=>{onSelect(rootId);setCollapsed(new Set(members.filter(node=>node.id!==rootId&&parents.has(node.id)).map(node=>node.id)));}}>Collapse branches</button><label><input type="checkbox" checked={labels} onChange={event=>setLabels(event.target.checked)}/> Labels</label></div></div>
  <div className="graph-surface" ref={surface}>
   <svg ref={svg} className="graph-canvas" role="group" aria-label="Objective graph" aria-describedby="graph-help" tabIndex={0} viewBox={`0 0 ${size.width} ${size.height}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={viewportKeys}>
    <g className="graph-camera" transform={`translate(${size.width/2+camera.x} ${size.height/2+camera.y}) scale(${camera.scale})`}>
     <g aria-hidden="true">{layout.edges.map(edge=>{const source=byId.get(edge.source)!,target=byId.get(edge.target)!;return <line key={edge.target} className={`graph-edge ${edge.source===current||edge.target===current?'is-connected':''}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={palette[edge.branch]??'#9aa58c'} vectorEffect="non-scaling-stroke"/>;})}</g>
     {layout.nodes.map(node=>{
      const objective=node.objective,active=objective.id===current,color=palette[node.branch]??'#9aa58c',radius=node.depth===0?18:node.childCount?11:7;
      const showLabel=labels&&(node.depth<2||active||members.length<=36||camera.scale>=.9),left=node.x<0,anchor=node.depth===0?'middle':left?'end':'start',labelX=node.depth===0?0:left?-18:18;
      return <g key={objective.id} data-graph-node={objective.id} className={`graph-node ${active?'is-selected':''} ${objective.status==='Complete'?'is-complete':''}`} role="button" tabIndex={0} aria-label={`Select ${references(objective.id)?.fullReference} ${objective.title}`} aria-current={active?'location':undefined} transform={`translate(${node.x} ${node.y})`} onClick={()=>onSelect(objective.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onSelect(objective.id);}}}>
       <title>{references(objective.id)?.fullReference} · {objective.title} · {objective.status}{node.childCount?` · ${node.childCount} supporting objectives`:''}</title>
       <circle className="graph-node-hit" r={radius+12}/><circle className="graph-node-ring" r={radius+6} vectorEffect="non-scaling-stroke"/>
       <circle className="graph-node-dot" r={radius} fill={color}/>
       {objective.status==='Blocked'&&<circle r={radius+3} fill="none" stroke={color} strokeDasharray="2 3" vectorEffect="non-scaling-stroke"/>}
       {collapsed.has(objective.id)&&node.childCount>0&&<text className="graph-collapsed-mark" textAnchor="middle" y={4}>+</text>}
       {showLabel&&<text className="graph-node-label" x={labelX} y={node.depth===0?36:4} textAnchor={anchor}>{shorten(objective.title,active?32:24)}</text>}
      </g>;
     })}
    </g>
   </svg>
   <span className="graph-count">{layout.nodes.length} of {members.length} objectives visible</span>
  </div>
  <p className="graph-help" id="graph-help">Select a node for details. Drag the background to pan; scroll or use + / − to zoom. Keyboard: arrow keys to pan, 0 to fit.</p>
  {branches.length>0&&<div className="graph-legend" aria-label="Main branches">{branches.map(branch=>{return <button key={branch.id} onClick={()=>onSelect(branch.id)} title={branch.title}><span style={{background:palette[positions.indexOf(branch.position)]}}/>{shorten(branch.title,27)}</button>;})}</div>}
  {selected&&<div className="graph-selection" aria-label="Selected objective"><div><small>{references(selected.id)?.fullReference}</small><h2>{selected.title}</h2><p>{selected.status} · {selected.priority} priority{selected.dueDate?` · Due ${selected.dueDate}`:''}</p>{selected.description&&<p className="graph-selection-description"><ReferenceText text={selected.description} context={{nodes,rootId}}/></p>}</div><div className="graph-selection-actions">{selectedChildren.length>0&&<Button variant="outline" onClick={()=>toggle(selected.id)}>{collapsed.has(selected.id)?'Expand branch':'Collapse branch'}</Button>}<Button variant="outline" onClick={()=>onEdit(selected)}>Edit selected objective</Button><Button onClick={()=>onOpen(selected.id)}>Open Mandala view</Button></div></div>}
 </section>;
}
