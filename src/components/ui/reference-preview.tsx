'use client';

import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type TextareaHTMLAttributes} from 'react';
import {createPortal} from 'react-dom';
import {referenceLookup,type Objective} from '@/lib/model';
import {referenceParts} from '@/lib/references';
import {ExpandingTextarea} from './expanding-textarea';

export type ReferenceContext={nodes:Objective[];rootId:string};
type Preview={target:Objective;rect:DOMRect;container:Element};

// One hover card per text block. Leaving the anchor starts a short close
// timer so the pointer can move onto the card to scroll a long description.
function useReferencePreview(){
 const [preview,setPreview]=useState<Preview|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const cancel=useCallback(()=>{clearTimeout(timer.current);timer.current=undefined;},[]);
 const show=useCallback((target:Objective,anchor:DOMRect,from:Element)=>{cancel();const container=from.closest('dialog')??document.body;
  timer.current=setTimeout(()=>setPreview(current=>current?.target.id===target.id&&current.rect.top===anchor.top&&current.rect.left===anchor.left?current:{target,rect:anchor,container}),preview?0:180);},[cancel,preview]);
 const hide=useCallback((delay=200)=>{cancel();timer.current=setTimeout(()=>setPreview(null),delay);},[cancel]);
 useEffect(()=>cancel,[cancel]);
 useEffect(()=>{if(!preview)return;const close=()=>setPreview(null);// Escape dismisses only the card, not the editor or dialog underneath it.
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  window.addEventListener('scroll',close,true);window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('scroll',close,true);window.removeEventListener('keydown',key,true);};},[preview]);
 return {preview,show,hide,cancel};
}

function ReferenceCard({preview,nodes,onEnter,onLeave}:{preview:Preview;nodes:Objective[];onEnter:()=>void;onLeave:()=>void}){
 const card=useRef<HTMLDivElement>(null);const [position,setPosition]=useState<{top:number;left:number}|null>(null);
 const label=useMemo(()=>referenceLookup(nodes)(preview.target.id)?.fullReference,[nodes,preview.target.id]);
 // Inside a modal <dialog> the card is clipped to the dialog box, so it is
 // kept within those bounds instead of the viewport.
 useLayoutEffect(()=>{const el=card.current;if(!el)return;const {rect,container}=preview,gap=8,margin=12,width=el.offsetWidth,height=el.offsetHeight;
  const box=container===document.body?{top:0,left:0,right:window.innerWidth,bottom:window.innerHeight}:container.getBoundingClientRect();
  const below=rect.bottom+gap+height<=box.bottom-margin||rect.top-gap-height<box.top+margin;
  setPosition({top:below?rect.bottom+gap:rect.top-gap-height,left:Math.max(box.left+margin,Math.min(rect.left,box.right-width-margin))});},[preview]);
 const {target}=preview;
 return createPortal(<div ref={card} role="tooltip" className="reference-preview" style={position?{top:position.top,left:position.left}:{top:0,left:0,visibility:'hidden'}} onMouseEnter={onEnter} onMouseLeave={onLeave}>
  <div className="reference-preview-header"><span className="reference-preview-code">{label}</span><span className={`objective-status status-${target.status.toLowerCase().replaceAll(' ','-')}`}>{target.status}</span></div>
  <strong className="reference-preview-title">{target.title||'Untitled objective'}</strong>
  {target.description?<p className="reference-preview-description">{target.description}</p>:<p className="reference-preview-description reference-preview-empty">No description yet.</p>}
 </div>,preview.container);
}

// Read-only text with hoverable references (grid cells, graph selection).
export function ReferenceText({text,context}:{text:string;context:ReferenceContext}){
 const parts=useMemo(()=>referenceParts(text,context.nodes,context.rootId),[text,context.nodes,context.rootId]);
 const {preview,show,hide,cancel}=useReferencePreview();
 if(parts.length===1&&!parts[0].target)return <>{text}</>;
 return <>{parts.map((part,i)=>part.target?<span key={i} className="text-reference" onMouseEnter={e=>show(part.target!,e.currentTarget.getBoundingClientRect(),e.currentTarget)} onMouseLeave={()=>hide()}>{part.text}</span>:part.text)}
  {preview&&<ReferenceCard preview={preview} nodes={context.nodes} onEnter={cancel} onLeave={()=>hide()}/>}</>;
}

// A textarea cannot hold hoverable elements, so a transparent mirror with the
// same text metrics sits on top (pointer-events: none) and draws the
// underlines; pointer positions are hit-tested against the mirror's spans.
const mirrored=['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','textIndent','tabSize','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'] as const;

export function ReferenceTextarea({value,context,...props}:TextareaHTMLAttributes<HTMLTextAreaElement>&{value:string;context:ReferenceContext}){
 const wrapper=useRef<HTMLDivElement>(null),mirror=useRef<HTMLDivElement>(null);
 const parts=useMemo(()=>referenceParts(value,context.nodes,context.rootId),[value,context.nodes,context.rootId]);
 const linked=parts.some(p=>p.target);
 const {preview,show,hide,cancel}=useReferencePreview();
 const hovered=useRef<number|null>(null);
 useLayoutEffect(()=>{const field=wrapper.current?.querySelector('textarea'),copy=mirror.current;if(!field||!copy)return;const style=getComputedStyle(field);
  for(const key of mirrored)copy.style[key]=style[key];copy.scrollTop=field.scrollTop;});
 const move=(x:number,y:number)=>{const spans=mirror.current?.querySelectorAll<HTMLElement>('[data-part]');
  for(const span of spans??[])for(const rect of span.getClientRects())if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom){const index=Number(span.dataset.part);
   if(hovered.current!==index||!preview){hovered.current=index;show(parts[index].target!,rect,span);}return;}
  if(hovered.current!==null){hovered.current=null;hide();}};
 return <div ref={wrapper} className="reference-textarea" onMouseMove={linked?e=>move(e.clientX,e.clientY):undefined} onMouseLeave={linked?()=>{hovered.current=null;hide();}:undefined}>
  <ExpandingTextarea value={value} {...props} onKeyDown={e=>{if(preview)hide(0);props.onKeyDown?.(e);}} onScroll={e=>{if(mirror.current)mirror.current.scrollTop=e.currentTarget.scrollTop;props.onScroll?.(e);}}/>
  {linked&&<div ref={mirror} className="reference-mirror" aria-hidden="true">{parts.map((part,i)=>part.target?<span key={i} data-part={i} className="text-reference">{part.text}</span>:part.text)}{'​'}</div>}
  {preview&&<ReferenceCard preview={preview} nodes={context.nodes} onEnter={cancel} onLeave={()=>{hovered.current=null;hide();}}/>}
 </div>;
}
