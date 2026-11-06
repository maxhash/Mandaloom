import {referenceLookup,type Objective} from './model';
// Human-readable references are independent of titles and grid positions.
// UUID links remain valid for older bookmarks and tool receipts.
export function gridHref(id:string,nodes:Objective[]){if(!id)return '/';const reference=referenceLookup(nodes)(id);return reference?'/m/'+reference.fullReference:'/?grid='+encodeURIComponent(id);}
export function resolveGrid(nodes:Objective[],pathname:string,search=''){
 let found:Objective|undefined,requested=false;
 if(pathname==='/' ){const id=new URLSearchParams(search).get('grid');requested=id!==null;found=nodes.find(n=>n.id===id);}
 else {requested=true;let path='';try{path=decodeURIComponent(pathname);}catch{}const match=/^\/m\/M(\d+)\/R((?:\.[1-9]\d*)*)\/?$/i.exec(path);
  if(match){found=nodes.find(n=>!n.parentId&&n.referenceNumber===Number(match[1]));for(const number of match[2].split('.').slice(1)){const parentId=found?.id;if(!parentId){found=undefined;break;}found=nodes.find(n=>n.parentId===parentId&&n.referenceNumber===Number(number));}}
 }
 return {id:found?.id??nodes.find(n=>!n.parentId)?.id??'',missing:requested&&!found};
}
