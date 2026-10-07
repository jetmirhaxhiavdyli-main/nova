import { useEffect, useState } from 'react';

/** Recording frame rate: 30 keeps the PC responsive, 60 is smoother (about a third more CPU). A per-PC preference, set in About. */
export const RECORDING_FPS = [{ id: '30', label: '30 fps' }, { id: '60', label: '60 fps' }];
const KEY = 'nova-recording-fps';
function read() {
  try { return localStorage.getItem(KEY) === '60' ? 60 : 30; } catch { return 30; }
}
let current = read();
const listeners = new Set();

export const getRecordingFps = () => current;
export function setRecordingFps(fps) {
  current = fps === 60 ? 60 : 30;
  try { localStorage.setItem(KEY, String(current)); } catch { /* private mode: still applies for this session */ }
  listeners.forEach(fn => fn(current));
}
export function useRecordingFps() {
  const [value, set] = useState(current);
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set); }; }, []);
  return [value, setRecordingFps];
}
