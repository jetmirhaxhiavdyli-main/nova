import { springStep } from './spring.mjs';

export const ZOOM_DEFAULTS = Object.freeze({
  scale: 1.55, holdMs: 2600, returnMs: 2200,
  zoomSpring: 7, panSpring: 4.5, returnSpring: 5,
  // Smaller target steps with a softer follow spring: gradual starts and stops
  // rather than noticeably spaced reframing commands during a cursor sweep.
  safeInset: 0.22, panIntervalMs: 64, pointerThreshold: 0.008,
});
export const FULL_FRAME = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
export const validPoint = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;

export function targetCrop(target, scale) {
  const size = 1 / scale;
  return { x: clamp(target.x - size / 2, 0, 1 - size), y: clamp(target.y - size / 2, 0, 1 - size), width: size, height: size };
}

// Plain JSON in recording-relative milliseconds, not rendered camera positions.
// Later edits can move a segment or change its scale/target/easing without video loss.
export function validateZoomTimeline(timeline) {
  if (timeline?.version !== 1 || timeline.timebase !== 'ms' || typeof timeline.enabled !== 'boolean' || !Array.isArray(timeline.segments) || (timeline.duration !== null && (!Number.isFinite(timeline.duration) || timeline.duration < 0))) throw new Error('Invalid zoom timeline.');
  const ids = new Set();
  for (const s of timeline.segments) {
    if (typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.enabled !== 'boolean' || ![s.start,s.release,s.end,s.scale,s.easing?.zoom,s.easing?.pan,s.easing?.out].every(Number.isFinite) || s.start < 0 || s.release <= s.start || s.end < s.release || s.scale < 1 || s.scale > 4 || !validPoint(s.target?.x,s.target?.y) || ![s.easing.zoom,s.easing.pan,s.easing.out].every(n => n >= 1 && n <= 60) || !Array.isArray(s.keyframes)) throw new Error('Invalid zoom segment.');
    if (timeline.duration !== null && s.end > timeline.duration) throw new Error('Zoom extends past the recording.');
    let previous = s.start;
    for (const key of s.keyframes) {
      if (!Number.isFinite(key.time) || key.time < previous || key.time >= s.release || !validPoint(key.target?.x,key.target?.y)) throw new Error('Invalid zoom target keyframe.');
      previous = key.time;
    }
    ids.add(s.id);
  }
  return timeline;
}

function compile(timeline) {
  validateZoomTimeline(timeline);
  if (!timeline.enabled) return [];
  const duration = timeline.duration ?? Infinity;
  const segments = timeline.segments.filter(s => s.enabled).slice().sort((a,b) => a.start - b.start || a.id.localeCompare(b.id));
  const commands = [];
  segments.forEach((s, index) => {
    const nextStart = segments[index + 1]?.start ?? Infinity;
    const add = (time,target,frequency,settle=false) => commands.push({time,target,frequency,settle: settle || s.instant === true});
    add(s.start,targetCrop(s.target,s.scale),s.easing.zoom);
    for (const k of s.keyframes) if (k.time < nextStart) add(k.time,targetCrop(k.target,s.scale),s.easing.pan);
    // A later segment owns overlapping time; an older return must not interrupt it.
    if (s.release < nextStart && s.release < duration) add(s.release,{...FULL_FRAME},s.easing.out);
    if (s.end < nextStart && s.end < duration) add(s.end,{...FULL_FRAME},s.easing.out,true);
  });
  return commands.sort((a,b) => a.time - b.time);
}

// Shared by live capture and future editor preview/export. Backwards seeking
// resets integration; forward playback advances only across new commands.
export function createZoomSampler(timeline) {
  const commands = compile(timeline);
  let value, velocity, target, last, index, frequency;
  function reset() { value={...FULL_FRAME};velocity={x:0,y:0,width:0,height:0};target={...FULL_FRAME};last=0;index=0;frequency=16; }
  function advance(now) {
    for (const key of Object.keys(FULL_FRAME)) [value[key],velocity[key]]=springStep(value[key],velocity[key],target[key],(now-last)/1000,frequency);
    last=now;
  }
  reset();
  return now => {
    if (!Number.isFinite(now)) throw new Error('Invalid zoom sample time.');
    now=clamp(now,0,timeline.duration ?? Infinity);
    if (now<last) reset();
    while(index<commands.length && commands[index].time<=now) {
      const command=commands[index++];advance(command.time);target=command.target;frequency=command.frequency;
      if(command.settle) {value={...command.target};velocity={x:0,y:0,width:0,height:0};}
    }
    advance(now);
    const width=clamp(value.width,.25,1),height=clamp(value.height,.25,1);
    return {x:clamp(value.x,0,1-width),y:clamp(value.y,0,1-height),width,height};
  };
}

// Editor operations return a new document, preserving the auto-generated original.
export function updateZoomSegment(timeline,id,changes) {
  const next=structuredClone(timeline),segment=next.segments.find(s=>s.id===id);
  if(!segment) throw new Error('Zoom segment not found.');
  if(Object.keys(changes).some(k=>!['start','release','end','scale','target','keyframes','easing','enabled'].includes(k))) throw new Error('Unknown zoom setting.');
  const delta=changes.start === undefined ? 0 : changes.start-segment.start;
  if(delta) {
    segment.release+=delta;segment.end+=delta;
    segment.keyframes=segment.keyframes.map(k=>({...k,time:k.time+delta}));
  }
  Object.assign(segment,structuredClone(changes),{origin:'manual'});
  return validateZoomTimeline(next);
}
export function removeZoomSegment(timeline,id) {
  const next=structuredClone(timeline);next.segments=next.segments.filter(s=>s.id!==id);return validateZoomTimeline(next);
}
export function addZoomSegment(timeline,segment) {
  const next=structuredClone(timeline);next.segments.push({...structuredClone(segment),origin:'manual'});return validateZoomTimeline(next);
}
