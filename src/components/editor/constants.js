// Editor presets and option lists (Figma: "08 · Editor panels (handoff)").

export const GRADIENTS = [
  ['#6366f1', '#ec4899'], ['#0ea5e9', '#6366f1'], ['#f97316', '#ec4899'], ['#10b981', '#0ea5e9'],
  ['#f59e0b', '#ef4444'], ['#8b5cf6', '#06b6d4'], ['#1e293b', '#475569'], ['#fda4af', '#fcd34d'],
  ['#a7f3d0', '#93c5fd'], ['#18181b', '#3f3f46'], ['#c084fc', '#f0abfc'], ['#e2e8f0', '#cbd5e1'],
];
export const gradientCss = ([a, b]) => `linear-gradient(135deg, ${a}, ${b})`;
// "Smooth" style: neighbouring hues, low contrast. Same 12 slots as GRADIENTS ("Hype").
export const SMOOTH_GRADIENTS = [
  ['#6366f1', '#818cf8'], ['#0ea5e9', '#38bdf8'], ['#f472b6', '#fb7185'], ['#10b981', '#34d399'],
  ['#f59e0b', '#fbbf24'], ['#8b5cf6', '#a78bfa'], ['#1e293b', '#334155'], ['#fecdd3', '#fed7aa'],
  ['#bbf7d0', '#bae6fd'], ['#18181b', '#27272a'], ['#e9d5ff', '#f5d0fe'], ['#f1f5f9', '#e2e8f0'],
];
export const GRADIENT_STYLES = [{ id: 'smooth', label: 'Smooth' }, { id: 'hype', label: 'Hype' }];

/** Built-in background images; edits store the id (bundled URLs change between builds). */
const bgUrl = name => new URL(`../../assets/backgrounds/${name}.webp`, import.meta.url).href;
export const BACKGROUND_IMAGES = ['dusk', 'ocean', 'forest', 'sunset', 'blush', 'graphite'].map(id => ({ id, label: id[0].toUpperCase() + id.slice(1), src: bgUrl(id) }));

/** Preset sub-type. Older edits have no `kind`: a string preset was animated, a number a gradient. */
export const backgroundKind = bg => bg.kind || (typeof bg.preset === 'string' ? 'animated' : 'gradient');
/** Two colours of the selected gradient preset (falls back to the first Hype gradient). */
export const presetGradient = bg => (typeof bg.preset === 'number' && (bg.style === 'smooth' ? SMOOTH_GRADIENTS : GRADIENTS)[bg.preset]) || GRADIENTS[0];
/** `background.image`: { id } for built-ins or { src } (data URL) for uploads, plus natural size and placement. */
export const imageSrc = image => image?.id ? BACKGROUND_IMAGES.find(b => b.id === image.id)?.src : image?.src;
/** Blur radius in px for a w×h canvas: `image.blur` 0–100 → up to 5% of the short side (same look at any size). */
export const imageBlurPx = (w, h, image) => ((image?.blur || 0) / 100) * Math.min(w, h) * 0.05;
/** Draw rect for a blurred image: enlarged by 2× the radius per side so the soft edges fall outside the canvas. */
export function blurredImageRect(w, h, image) {
  const r = imageRect(w, h, image), pad = imageBlurPx(w, h, image) * 2;
  // Only a covering image is enlarged; a smaller one keeps its size and simply gets soft edges.
  const px = r.width >= w ? pad : 0, py = r.height >= h ? pad : 0;
  return { ...r, x: r.x - px, y: r.y - py, width: r.width + px * 2, height: r.height + py * 2 };
}
export const IMAGE_SCALE = { min: 0.2, max: 3 };
export const IMAGE_FILL = '#18181b'; // default colour around an image smaller than the canvas
/**
 * Where the image is drawn in a w×h canvas. Scale 1 = "cover" (fills the canvas); `scale` resizes it (aspect kept,
 * 0.2–3). `x`/`y` offset its centre as a fraction of the canvas, like `video.position`: an image larger than the
 * canvas never shows an edge, a smaller one stays fully inside. `maxX`/`maxY` are the allowed offsets in px.
 */
export function imageRect(w, h, image) {
  const base = Math.max(w / image.width, h / image.height) * clamp(image.scale || 1, IMAGE_SCALE.min, IMAGE_SCALE.max);
  const iw = image.width * base, ih = image.height * base, maxX = Math.abs(iw - w) / 2, maxY = Math.abs(ih - h) / 2;
  return { width: iw, height: ih, x: (w - iw) / 2 + clamp((image.x || 0) * w, -maxX, maxX), y: (h - ih) / 2 + clamp((image.y || 0) * h, -maxY, maxY), maxX, maxY };
}

/**
 * Animated presets: `background.preset` holds the id (static presets stay numeric indexes into GRADIENTS).
 * Preview and export sample the same seekable 120-degree, 300%-size gradient drift.
 */
export const ANIMATED_BACKGROUNDS = [
  { id: 'aurora', label: 'Aurora', colors: ['#6366f1', '#06b6d4', '#ec4899', '#8b5cf6'], seconds: 12 },
  { id: 'sunset', label: 'Sunset', colors: ['#f97316', '#fb7185', '#e11d48', '#f59e0b'], seconds: 12 },
  { id: 'ocean', label: 'Ocean', colors: ['#1e3a8a', '#2563eb', '#0d9488', '#22d3ee'], seconds: 14 },
  { id: 'forest', label: 'Forest', colors: ['#14532d', '#059669', '#84cc16', '#0f766e'], seconds: 14 },
  { id: 'candy', label: 'Candy', colors: ['#f472b6', '#c4b5fd', '#7dd3fc', '#fdba74'], seconds: 10 },
  { id: 'ember', label: 'Ember', colors: ['#1c1917', '#991b1b', '#ea580c', '#facc15'], seconds: 12 },
  { id: 'midnight', label: 'Midnight', colors: ['#09090b', '#312e81', '#334155', '#5b21b6'], seconds: 16 },
  { id: 'mono', label: 'Mono', colors: ['#18181b', '#52525b', '#a1a1aa', '#3f3f46'], seconds: 16 },
];
export const animatedBackground = preset => ANIMATED_BACKGROUNDS.find(b => b.id === preset) || null;
export const animatedCss = ({ colors }) => `linear-gradient(120deg, ${[...colors, colors[0]].join(', ')})`;

// CSS ease-in-out = cubic-bezier(.42, 0, .58, 1). Invert x before sampling y.
export function animatedBackgroundProgress(preset, time = 0) {
  const cycle = Math.max(0, Number.isFinite(time) ? time : 0) / preset.seconds;
  const phase = cycle % 2, x = phase <= 1 ? phase : 2 - phase;
  let low = 0, high = 1;
  for (let i = 0; i < 28; i++) {
    const t = (low + high) / 2, v = 3 * (1-t) * (1-t) * t * .42 + 3 * (1-t) * t * t * .58 + t*t*t;
    if (v < x) low = t; else high = t;
  }
  const t = (low + high) / 2;
  return 3 * (1-t) * t*t + t*t*t;
}

export function animatedBackgroundFrame(width, height, preset, time = 0) {
  const progress = animatedBackgroundProgress(preset, time);
  const w = width * 3, h = height * 3, dx = Math.sin(2*Math.PI/3), dy = -Math.cos(2*Math.PI/3);
  // CSS percentage position aligns that percentage of image and container sizes.
  const cx = w/2 + (width-w)*progress, cy = h/2 + (height-h)/2;
  const half = (Math.abs(w*dx) + Math.abs(h*dy))/2;
  return {x0:cx-dx*half,y0:cy-dy*half,x1:cx+dx*half,y1:cy+dy*half,colors:[...preset.colors,preset.colors[0]]};
}

/**
 * Camera overlay (`edits.camera`). x/y = centre as a fraction of the canvas; size = height as a fraction of the
 * canvas's short side; shape 'circle' (1:1) or 'rounded' (4:3 rounded rectangle); mirror flips it horizontally.
 * Defaults put a circle in the bottom-right corner.
 */
export const CAMERA_DEFAULTS = { visible: true, x: 1, y: 1, size: 0.26, shape: 'circle', mirror: true };
export const CAMERA_SIZE = { min: 0.12, max: 0.5 };
export const CAMERA_SHAPES = [{ id: 'circle', label: 'Circle' }, { id: 'rounded', label: 'Rounded' }];
/** Pixel rect of the camera in a w×h canvas, kept fully inside with a 3% margin. Shared by preview and export. */
export function cameraRect(w, h, camera) {
  const c = { ...CAMERA_DEFAULTS, ...camera }, short = Math.min(w, h), margin = short * 0.03;
  const height = short * clamp(c.size, CAMERA_SIZE.min, CAMERA_SIZE.max), width = c.shape === 'rounded' ? height * 4 / 3 : height;
  const cx = clamp(c.x * w, margin + width / 2, w - margin - width / 2), cy = clamp(c.y * h, margin + height / 2, h - margin - height / 2);
  return { x: cx - width / 2, y: cy - height / 2, width, height, radius: c.shape === 'circle' ? height / 2 : height * 0.16 };
}

export const SWATCHES =['#ffffff', '#e4e4e7', '#18181b', '#7c3aed', '#2563eb', '#16a34a'];

/** `width`/`height` null = follow the recording. Glyph sizes draw the ratio icon in the menu. */
export const OUTPUT_SIZES = [
  { id: 'original', label: 'Match recording', ratio: null, width: null, height: null, glyph: [14, 9] },
  { id: '16:9', label: 'Widescreen', short: '16:9', width: 1920, height: 1080, glyph: [14, 9] },
  { id: '1:1', label: 'Square', short: '1:1', width: 1080, height: 1080, glyph: [11, 11] },
  { id: '4:3', label: 'Standard', short: '4:3', width: 1440, height: 1080, glyph: [13, 10] },
  { id: '9:16', label: 'Vertical', short: '9:16', width: 1080, height: 1920, glyph: [8, 14] },
];

export const CUSTOM_MIN = 64, CUSTOM_MAX = 4096;
/** Canvas size for `edits.output` ({ size, width?, height? }); falls back to the recording. */
export function outputDims(output, source) {
  if (output.size === 'custom' && output.width > 0 && output.height > 0) return { width: output.width, height: output.height };
  const preset = OUTPUT_SIZES.find(o => o.id === output.size);
  return preset?.width ? { width: preset.width, height: preset.height } : source;
}

export const MUSIC_TRACKS = [
  { id: 'none', label: 'None' },
  { id: 'calm', label: 'Calm' },
  { id: 'upbeat', label: 'Upbeat' },
  { id: 'lofi', label: 'Lo-fi' },
];

// Older projects may hold the removed light/dot/ring styles: preview and export draw those as the default arrow.
export const CURSOR_STYLES = [
  { id: 'default', label: 'Default' },
  { id: 'large', label: 'Large' },
  { id: 'touch', label: 'Touch' },
];

export const SPLIT_TARGETS = [
  { id: 'both', label: 'Video and audio', note: 'Cuts every track at the playhead' },
  { id: 'video', label: 'Video only', note: 'Sound keeps playing across the cut' },
  { id: 'audio', label: 'Audio only', note: 'The video stays in one piece' },
];

// Timeline rows (px from the top of the track area). Audio spans voice + music rows.
export const ROWS = {
  ruler: { top: 0, height: 16 },
  clip: { top: 22, height: 56 },
  voice: { top: 84, height: 24 },
  music: { top: 112, height: 20 },
  zoom: { top: 138, height: 32 },
  playhead: { top: 16, height: 154 },
};
export const SPLIT_ROWS = {
  both: { top: ROWS.clip.top, height: ROWS.music.top + ROWS.music.height - ROWS.clip.top },
  video: ROWS.clip,
  audio: { top: ROWS.voice.top, height: ROWS.music.top + ROWS.music.height - ROWS.voice.top },
};

export const ZOOM_DEFAULTS = { level: 1.5, mode: 'auto', instant: false };
export const ZOOM_MIN_LENGTH = 1;
export const TRIM_MIN_LENGTH = 0.5; // shortest clip the trim handles allow (s)
export const NEW_ZOOM_LENGTH = 4;
export const WAVE_BUCKETS = 150;
export const MUSIC_BUCKETS = 120;
export const EASE_FLUID = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** 0:12.4 */
export function formatTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
