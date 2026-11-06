'use client';

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function ExpandingTextarea({ value, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
 const ref = useRef<HTMLTextAreaElement>(null);
 useLayoutEffect(() => {
  const resize = () => {
   const field = ref.current;
   if (!field || !field.getClientRects().length) return;
   field.style.height = 'auto';
   field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  };
  resize();
  // Expanded dialogs become measurable only after showModal; also respond to
  // container-width changes without adding an inner scrollbar.
  let width=-1;
  const observer=new ResizeObserver(entries=>{const next=entries[0]?.contentRect.width;if(next!==undefined&&next!==width){width=next;resize();}});
  if(ref.current)observer.observe(ref.current);
  window.addEventListener('resize', resize);
  return () => {observer.disconnect();window.removeEventListener('resize', resize);};
 }, [value]);
 return <textarea ref={ref} className={cn('expanding-textarea', className)} value={value} {...props}/>;
}
