'use client';
import {useEffect,useMemo,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {CalendarClock,Check,X} from 'lucide-react';
import {dueLabel,referenceLookup,type Objective} from '@/lib/model';
import {timelineDate,timelineGroups} from '@/lib/timeline';

type Props={nodes:Objective[];current:string;rootId?:string;open:boolean;onOpenChange:Dispatch<SetStateAction<boolean>>;onNavigate:(id:string)=>void};

export function TaskTimeline({nodes,current,rootId,open,onOpenChange,onNavigate}:Props){
 const [wide,setWide]=useState(false),[scope,setScope]=useState('all'),[now,setNow]=useState<Date|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 const groups=useMemo(()=>timelineGroups(nodes,scope==='current'?rootId:undefined),[nodes,scope,rootId]);
 const references=useMemo(()=>referenceLookup(nodes),[nodes]);
 const total=groups.reduce((count,group)=>count+group.nodes.length,0);
 const dated=groups.filter(group=>group.date).reduce((count,group)=>count+group.nodes.length,0);
 useEffect(()=>{
  const media=window.matchMedia('(min-width:1360px)');
  const update=()=>{setWide(media.matches);if(media.matches)onOpenChange(false);};
  update();media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[onOpenChange]);
 useEffect(()=>{setNow(new Date());const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  const element=dialog.current;if(!element)return;
  if(open&&!wide){if(!element.open)element.showModal();}else if(element.open)element.close();
 },[open,wide]);
 const navigate=(id:string)=>{onNavigate(id);onOpenChange(false);};
 const content=<>
  <div className="timeline-heading"><div><div className="eyebrow">YOUR NEXT STEPS</div><h2 id="timeline-title"><CalendarClock size={18}/> Timeline</h2></div>{!wide&&<button type="button" className="icon" aria-label="Close timeline" onClick={()=>onOpenChange(false)}><X size={19}/></button>}</div>
  <label className="timeline-scope">Show<select aria-label="Timeline scope" value={scope} onChange={e=>setScope(e.target.value)}><option value="all">All Mandalas</option><option value="current" disabled={!rootId}>Current Mandala</option></select></label>
  <p className="timeline-summary">{total} {total===1?'objective':'objectives'} · {dated} scheduled<span>Earliest due date first</span></p>
  <div className="timeline-scroll">
   {groups.length===0?<p className="timeline-empty">Add an objective to start your timeline.</p>:groups.map(group=><section key={group.date||'unscheduled'} className="timeline-group" aria-label={timelineDate(group.date)}>
    <h3>{group.date?<time dateTime={group.date}>{timelineDate(group.date)}</time>:'Unscheduled'}<span>{group.nodes.length}</span></h3>
    <ol>{group.nodes.map(node=>{
     const label=node.dueDate&&now?dueLabel(node.dueDate,node.status,now):'';
     const overdue=label==='Overdue',today=label==='Due today';
     return <li key={node.id} className={`timeline-item ${node.status==='Complete'?'is-complete':''} ${overdue?'is-overdue':''} ${today?'is-today':''}`}>
      <button type="button" className="timeline-entry" aria-current={node.id===current?'location':undefined} onClick={()=>navigate(node.id)}>
       <span className="timeline-reference">{references(node.id)?.fullReference}</span><strong>{node.title}</strong>
       <span className="timeline-meta"><span className={`timeline-status status-${node.status.toLowerCase().replaceAll(' ','-')}`}>{node.status==='Complete'&&<Check size={11}/>} {node.status}</span>{node.priority!=='Normal'&&<span className={`timeline-priority priority-${node.priority.toLowerCase()}`}>{node.priority} priority</span>}{(overdue||today)&&<span className="timeline-due">{label}</span>}</span>
      </button>
     </li>;
    })}</ol>
   </section>)}
  </div>
 </>;
 return wide?<aside className="task-timeline" aria-labelledby="timeline-title">{content}</aside>:<dialog ref={dialog} id="timeline-drawer" className="task-timeline timeline-drawer" aria-labelledby="timeline-title" onCancel={()=>onOpenChange(false)} onClose={()=>onOpenChange(false)} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onOpenChange(false);}}}>{content}</dialog>;
}
