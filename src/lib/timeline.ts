import {hierarchyRows,type Objective} from './model';

export type TimelineGroup={date:string;nodes:Objective[]};

// Dates are validated YYYY-MM-DD values. Keep undated objectives after all dates,
// and retain hierarchy order for ties so the plan does not jump between renders.
export function timelineGroups(nodes:Objective[],rootId?:string):TimelineGroup[]{
 const groups=new Map<string,Objective[]>();
 for(const {node} of hierarchyRows(nodes)){
  if(rootId&&node.rootId!==rootId)continue;
  const group=groups.get(node.dueDate);
  if(group)group.push(node);else groups.set(node.dueDate,[node]);
 }
 return [...groups].sort(([a],[b])=>a===b?0:!a?1:!b?-1:a.localeCompare(b)).map(([date,nodes])=>({date,nodes}));
}

export function timelineDate(date:string):string{
 if(!date)return 'Unscheduled';
 const [year,month,day]=date.split('-').map(Number);
 const local=new Date(0);local.setFullYear(year,month-1,day);local.setHours(12,0,0,0);
 return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(local);
}
