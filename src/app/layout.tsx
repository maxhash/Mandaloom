import type { Metadata } from 'next';
import './globals.css';
import { ThemeToggle } from '@/components/theme-toggle';
export const metadata: Metadata = { title: 'Mandaloom — Space to think deeper', description: 'A private, infinitely connected workspace for your goals.' };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="en" data-theme="dark" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"try{document.documentElement.dataset.theme=localStorage.getItem('mandaloom-theme')==='light'?'light':'dark'}catch(e){}"}}/></head><body>{children}<ThemeToggle/></body></html>; }
