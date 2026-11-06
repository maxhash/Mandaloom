'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button} from './button';
import {ExpandingTextarea} from './expanding-textarea';

type Props={label:string;value:string;onChange:(value:string)=>void;maxLength:number;rows?:number;required?:boolean;autoFocus?:boolean;placeholder?:string;checklist?:boolean};

// Formatting is explicit, preserves blank lines, and never creates objectives.
function asChecklist(text:string){return text.split('\n').map(line=>line.trim()&&!/^\s*[-*] \[[ xX]\]/.test(line)?'- [ ] '+line.replace(/^\s*[-*]\s+/,''):line).join('\n');}

export function ObjectiveTextField({label,value,onChange,maxLength,rows=1,required,autoFocus,placeholder,checklist=false}:Props){
 const id=useId(),dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement>(null);
 const [expanded,setExpanded]=useState(false),[draft,setDraft]=useState('');
 const [formatError,setFormatError]=useState('');
 useEffect(()=>{if(!expanded)return;const panel=dialog.current;panel?.showModal();return()=>{panel?.close();opener.current?.focus({preventScroll:true});};},[expanded]);
 const format=()=>{const next=asChecklist(draft);if(next.length>maxLength){setFormatError('The checklist would exceed this field’s character limit. Shorten the text first.');return;}setDraft(next);setFormatError('');};
 return <div className="objective-text-field">
  <div className="text-field-heading"><label htmlFor={id}>{label}</label><button ref={opener} type="button" className="reference-copy" aria-label={`Expand ${label}`} onClick={()=>{setDraft(value);setFormatError('');setExpanded(true);}}>Expand</button></div>
  <ExpandingTextarea id={id} aria-label={label} aria-describedby={checklist?`${id}-hint`:undefined} rows={rows} required={required} autoFocus={autoFocus} maxLength={maxLength} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>
  {checklist&&<small id={`${id}-hint`} className="text-field-hint">Use one criterion per line and blank lines between milestones. Expand for checklist formatting.</small>}
  {expanded&&createPortal(<dialog ref={dialog} className="expanded-text-dialog" aria-labelledby={`${id}-heading`} onCancel={()=>setExpanded(false)}>
   <div className="expanded-text-header"><h2 id={`${id}-heading`}>{label}</h2><p>Changes return to the objective editor. Save the objective to keep them.</p></div>
   {checklist&&<div className="text-format-toolbar"><Button type="button" variant="outline" onClick={format}>Make checklist</Button><span>One criterion per line. Separate milestones with blank lines.</span></div>}
   <ExpandingTextarea aria-label={`Expanded ${label}`} autoFocus rows={10} maxLength={maxLength} placeholder={placeholder} value={draft} onChange={e=>{setDraft(e.target.value);setFormatError('');}}/>
   {formatError&&<p role="alert" className="error">{formatError}</p>}
   <div className="expanded-text-actions"><span>{draft.length.toLocaleString()} / {maxLength.toLocaleString()}</span><Button type="button" variant="outline" onClick={()=>setExpanded(false)}>Cancel</Button><Button type="button" onClick={()=>{onChange(draft);setExpanded(false);}}>Done</Button></div>
  </dialog>,document.body)}
 </div>;
}
