// Sample content for designing in a plain browser (`npm run dev`), where window.recorder
// (the Electron bridge) does not exist. Never used inside the desktop app.

export const PREVIEW_SOURCES = [
  { id: 'screen:1', name: 'Display 1', type: 'Screen', meta: '3024 × 1964 · 120 Hz' },
  { id: 'screen:2', name: 'Display 2', type: 'Screen', meta: '5120 × 2880 · 60 Hz' },
  { id: 'window:1', name: 'Dashboard', type: 'Window', meta: 'Browser', tone: '#fafafa' },
  { id: 'window:2', name: 'main.jsx', type: 'Window', meta: 'Code editor', tone: '#1e1e22' },
  { id: 'window:3', name: 'Onboarding flow', type: 'Window', meta: 'Design tool', tone: '#f1f0ee' },
  { id: 'window:4', name: 'Roadmap', type: 'Window', meta: 'Notes', tone: '#ffffff' },
  { id: 'window:5', name: 'npm run dev', type: 'Window', meta: 'Terminal', tone: '#101012' },
];

/**
 * Camera / microphone sample state per preview (`?preview=camera-picker | camera-denied | camera-none |
 * camera-disconnected | camera-loading | mic-picker | mic-denied | mic-none | camera` (recording with the bubble)).
 */
const CAMERAS = [{ id: 'cam-1', name: 'FaceTime HD Camera', meta: 'Built-in' }, { id: 'cam-2', name: 'Logitech C920', meta: 'USB' }];
const MICS = [{ id: 'mic-1', name: 'MacBook Pro Microphone', meta: 'Built-in' }, { id: 'mic-2', name: 'Shure MV7', meta: 'USB' }, { id: 'mic-3', name: 'AirPods Pro', meta: 'Bluetooth' }];
export function PREVIEW_DEVICES(preview = '') {
  const cameraStatus = { 'camera-denied': 'denied', 'camera-none': 'none', 'camera-disconnected': 'disconnected', 'camera-loading': 'loading' }[preview] || 'ready';
  const micStatus = { 'mic-denied': 'denied', 'mic-none': 'none' }[preview] || 'ready';
  return {
    camera: { devices: cameraStatus === 'none' ? [] : CAMERAS, selectedId: ['camera-picker', 'camera-disconnected', 'camera', 'camera-loading'].includes(preview) ? 'cam-1' : null, status: cameraStatus, stream: null },
    mic: { devices: micStatus === 'none' ? [] : MICS, selectedId: preview === 'mic-picker' ? 'mic-2' : null, status: micStatus, level: 0.55 },
  };
}

// Editor sample (`?preview=editor…`): a 48 s product demo with cursor motion, clicks, speech and two zooms.
const SPEECH = [[0.8, 7.6], [9.8, 15.2], [17, 24.6], [27.2, 33], [35, 43.8]];
const CLICKS = [9, 16, 26, 31, 41];
const speaking = t => SPEECH.some(([a, b]) => t >= a && t <= b);
export const PREVIEW_EDITOR = {
  name: 'Product demo',
  project: 'Launch videos',
  camera: {}, // has a camera track (no url in the browser preview, so a silhouette stands in)
  duration: 48,
  fps: 30,
  size: { width: 1920, height: 1080 },
  // [time s, x, y] with x/y normalised to the recording.
  cursor: [[0, .3, .4], [5, .5, .35], [9, .72, .55], [12, .68, .6], [16, .35, .22], [21, .2, .3], [26, .55, .75], [29, .72, .62], [31, .8, .2], [36, .6, .5], [41, .3, .6], [45, .5, .5], [48, .62, .45]],
  clicks: CLICKS,
  // Normalised 0–1 peaks per bucket, with whether each bucket is speech.
  voice: Array.from({ length: 150 }, (_, i) => {
    const t = (i + 0.5) / 150 * 48, speech = speaking(t);
    const peak = speech ? 0.35 + 0.6 * Math.abs(Math.sin(t * 7.3) * Math.cos(t * 2.1))
      : CLICKS.some(c => Math.abs(c - t) < 0.25) ? 0.55 : 0.1 + 0.08 * Math.abs(Math.sin(t * 13));
    return { peak, speech };
  }),
  music: Array.from({ length: 120 }, (_, i) => { const t = (i + 0.5) / 120 * 48; return 0.5 + 0.35 * Math.abs(Math.sin(t * 3.1) * Math.sin(t * 1.3)); }),
  speech: SPEECH,
  // Typing / scrolling stretches (s) for the clip row.
  activity: [{ kind: 'typing', start: 2.1, end: 4.6 }, { kind: 'scroll', start: 17.5, end: 20.2 }, { kind: 'typing', start: 33.4, end: 35.8 }, { kind: 'scroll', start: 42, end: 44.5 }],
  zooms: [
    { id: 'z1', start: 7.2, end: 12.9, level: 1.5, mode: 'auto', instant: false, focus: { x: .72, y: .55 } },
    { id: 'z2', start: 26.8, end: 33.1, level: 2, mode: 'fixed', instant: false, focus: { x: .68, y: .58 } },
  ],
};

export const PREVIEW_RECORDINGS = [
  { id: 1, name: 'Product demo', date: 'Today, 10:24', duration: '0:48', wall: '#a3b5a0', window: '#fafafa' },
  { id: 2, name: 'Onboarding walkthrough', date: 'Yesterday, 16:02', duration: '2:13', wall: '#d8c6a5', window: '#f4f4f5' },
  { id: 3, name: 'Export flow bug repro', date: 'Yesterday, 11:40', duration: '0:31', wall: '#2c2e33', window: '#1e1e22' },
  { id: 4, name: 'Settings page tour', date: 'Sep 21, 14:15', duration: '1:05', wall: '#9dbbd8', window: '#fafafa', folderId: 'f-tutorials' },
  { id: 5, name: 'Release notes teaser', date: 'Sep 19, 09:52', duration: '0:22', wall: '#c98a70', window: '#f4f4f5', folderId: 'f-tutorials' },
];
export const PREVIEW_FOLDERS = [{ id: 'f-tutorials', name: 'Tutorials' }];
