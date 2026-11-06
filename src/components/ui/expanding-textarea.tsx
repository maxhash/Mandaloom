'use client';

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function ExpandingTextarea({ value, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
 const ref = useRef<HTMLTextAreaElement>(null);
 useLayoutEffect(() => {
  const resize = () => {
   const field = ref.current;
   if (!field) return;
   field.style.height = 'auto';
   field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  };
  resize();
  window.addEventListener('resize', resize);
  return () => window.removeEventListener('resize', resize);
 }, [value]);
 return <textarea ref={ref} className={cn('expanding-textarea', className)} value={value} {...props}/>;
}
