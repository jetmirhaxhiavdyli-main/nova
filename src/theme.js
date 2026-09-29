import { useEffect, useState } from 'react';

/**
 * App theme: 'system' (follows Windows), 'light' or 'dark'. HeroUI switches all its colours on the
 * <html> class (.light / .dark); our own light values live in style.css under `.light`.
 * The choice is a per-PC convenience, so localStorage is enough (it survives updates).
 */
export const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];
const KEY = 'nova-theme';
const media = window.matchMedia?.('(prefers-color-scheme: dark)');

function read() {
  // Browser preview: `&theme=light` shows a screen in one theme without changing the saved choice.
  const param = new URLSearchParams(location.search).get('theme');
  if (THEMES.some(t => t.id === param)) return param;
  try { const v = localStorage.getItem(KEY); return THEMES.some(t => t.id === v) ? v : 'system'; } catch { return 'system'; }
}
function apply(pref) {
  const dark = pref === 'dark' || (pref === 'system' && (media ? media.matches : true));
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

let current = read();
const listeners = new Set();
apply(current);
media?.addEventListener?.('change', () => { if (current === 'system') apply(current); });

export function setTheme(pref) {
  current = pref;
  try { localStorage.setItem(KEY, pref); } catch { /* private mode: still applies for this session */ }
  apply(pref);
  listeners.forEach(fn => fn(pref));
}

export function useTheme() {
  const [pref, setPref] = useState(current);
  useEffect(() => { listeners.add(setPref); return () => listeners.delete(setPref); }, []);
  return [pref, setTheme];
}
