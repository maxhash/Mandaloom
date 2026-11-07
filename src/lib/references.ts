import type {Objective} from './model';

// References written in free text, e.g. "R.1.6" (inside the current Mandala)
// or "M002/R.3" (any Mandala). A bare "R" is too common to treat as a link,
// so relative references need at least one segment.
export type TextReference={start:number;end:number;text:string;mandala?:number;segments:number[]};

const pattern=/(?<![\w./])(?:M(\d{1,10})\/R((?:\.[1-9]\d{0,9})*)|R((?:\.[1-9]\d{0,9})+))(?![\w])/g;

export function findReferences(text:string):TextReference[]{
 const found:TextReference[]=[];
 for(const match of text.matchAll(pattern)){
  const path=match[2]??match[3]??'';
  found.push({start:match.index,end:match.index+match[0].length,text:match[0],mandala:match[1]===undefined?undefined:Number(match[1]),segments:path.split('.').slice(1).map(Number)});
 }
 return found;
}

// Relative references resolve inside rootId; full references name their Mandala.
export function resolveReference(nodes:Objective[],rootId:string,reference:Pick<TextReference,'mandala'|'segments'>):Objective|undefined{
 let found=reference.mandala===undefined?nodes.find(n=>n.id===rootId&&!n.parentId):nodes.find(n=>!n.parentId&&n.referenceNumber===reference.mandala);
 for(const number of reference.segments){
  const parentId=found?.id;if(!parentId)return undefined;
  found=nodes.find(n=>n.parentId===parentId&&n.referenceNumber===number);
 }
 return found;
}

export type TextPart={text:string;target?:Objective;reference?:TextReference};

// Splits text into plain runs and resolved references; unresolved ones stay plain.
export function referenceParts(text:string,nodes:Objective[],rootId:string):TextPart[]{
 const parts:TextPart[]=[];let cursor=0;
 for(const reference of findReferences(text)){
  const target=resolveReference(nodes,rootId,reference);if(!target)continue;
  if(reference.start>cursor)parts.push({text:text.slice(cursor,reference.start)});
  parts.push({text:reference.text,target,reference});cursor=reference.end;
 }
 if(cursor<text.length||!parts.length)parts.push({text:text.slice(cursor)});
 return parts;
}
