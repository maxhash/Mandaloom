import type {Objective} from './model';

export type LiveSnapshot={revision:number;nodes:Objective[];nextRootNumber?:number};
type Options={read:()=>Promise<LiveSnapshot|null>;state:()=>{revision:number;dirty:boolean;editing:boolean;saving:boolean};apply:(snapshot:LiveSnapshot)=>void;defer:(dirty:boolean)=>void;error:()=>void};

// Inspect local state again after every network response: editing or autosaving
// may have begun while the read was in flight. No incoming snapshot is written.
export function createLiveSync(options:Options){
 let stopped=false,running=false,again=false;
 const refresh=async()=>{
  if(stopped)return;
  if(running){again=true;return;}
  running=true;
  try{const snapshot=await options.read();if(stopped||!snapshot)return;const state=options.state();
   if(snapshot.revision<=state.revision||state.saving)return;
   if(state.dirty||state.editing)options.defer(state.dirty);else options.apply(snapshot);
  }catch{if(!stopped)options.error();}
  finally{running=false;if(again&&!stopped){again=false;void refresh();}}
 };
 return {refresh,stop:()=>{stopped=true;}};
}
