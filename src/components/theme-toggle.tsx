'use client';
import { Moon, Sun } from 'lucide-react';
export function ThemeToggle() {
 const toggle = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('mandaloom-theme', theme); } catch { /* Theme still works without storage. */ }
 };
 return <button type="button" className="icon theme-toggle" aria-label="Toggle dark theme" title="Switch light / dark theme" onClick={toggle}><Moon className="moon-icon" size={18}/><Sun className="sun-icon" size={18}/></button>;
}
