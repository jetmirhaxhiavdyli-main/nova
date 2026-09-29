import { ZOOM_DEFAULTS, FULL_FRAME, validPoint, targetCrop, createZoomSampler, validateZoomTimeline } from './zoomTimeline.mjs';

// Online authoring of editable zoom segments. Rendering uses the same timeline
// sampler that an editor can use later, so there is no separate "preview" curve.
export function createZoomMotion({ enabled = true } = {}) {
  const timeline = { version: 1, timebase: 'ms', enabled, duration: null, defaults: { ...ZOOM_DEFAULTS }, segments: [] };
  let active = null, pointer = null, sequence = 0, dirty = true, sampler;
  const settings = timeline.defaults;
  const current = time => {
    if (active && time >= active.release) active = null;
    return active;
  };
  const target = segment => segment.keyframes.at(-1)?.target || segment.target;
  function extend(segment, time, force = false) {
    const release = time + settings.holdMs;
    if (force || release > segment.release + 120) {
      segment.release = Math.max(segment.release, release);
      segment.end = segment.release + settings.returnMs;
      dirty = true;
    }
  }
  function reframe(segment, x, y, time, reason) {
    const crop = targetCrop(target(segment), segment.scale);
    const inset = settings.safeInset;
    const left=crop.x+crop.width*inset,right=crop.x+crop.width*(1-inset);
    const top=crop.y+crop.height*inset,bottom=crop.y+crop.height*(1-inset);
    if(x>=left && x<=right && y>=top && y<=bottom) return;
    if(reason==='pointer' && time-(segment.keyframes.at(-1)?.time ?? segment.start)<settings.panIntervalMs) return;
    // Mouse movement shifts only enough to keep it in the safe region. A new
    // click outside that region deliberately reframes around its new subject.
    const next = reason==='click' ? {x,y} : {
      x: crop.x+crop.width/2 + (x<left?x-left:x>right?x-right:0),
      y: crop.y+crop.height/2 + (y<top?y-top:y>bottom?y-bottom:0),
    };
    next.x=Math.max(0,Math.min(1,next.x));next.y=Math.max(0,Math.min(1,next.y));
    segment.keyframes.push({time,target:next,reason});dirty=true;
  }
  return {
    frame(now) {
      if (!Number.isFinite(now)) return {...FULL_FRAME};
      if(dirty) {sampler=createZoomSampler(timeline);dirty=false;}
      return sampler(Math.max(0,now));
    },
    click(x,y,time) {
      if(!validPoint(x,y)||!Number.isFinite(time)||time<0) return;
      let segment=current(time);
      if(!segment) {
        segment={id:`zoom-${++sequence}`,origin:'automatic',enabled:true,start:time,
          release:time+settings.holdMs,end:time+settings.holdMs+settings.returnMs,
          scale:settings.scale,target:{x,y},keyframes:[],
          easing:{zoom:settings.zoomSpring,pan:settings.panSpring,out:settings.returnSpring}};
        timeline.segments.push(segment);active=segment;dirty=true;
      } else {extend(segment,time,true);reframe(segment,x,y,time,'click');}
      pointer={x,y};
    },
    pointer(point,time) {
      if(!Number.isFinite(time)||time<0) return;
      if(!point || point.visible===false || !validPoint(point.x,point.y)) {pointer=null;return;}
      const moved=pointer && Math.hypot(point.x-pointer.x,point.y-pointer.y)>=settings.pointerThreshold;
      // Accumulate tiny movement against the last meaningful sample, not the
      // last frame, so slow purposeful motion still counts but jitter does not.
      if(!pointer || moved) pointer={x:point.x,y:point.y};
      const segment=current(time);
      if(segment && moved) {extend(segment,time);reframe(segment,point.x,point.y,time,'pointer');}
    },
    activity(kind,x,y,time) {
      if(!['typing','scroll'].includes(kind)||!validPoint(x,y)||!Number.isFinite(time)||time<0) return;
      const segment=current(time);
      if(segment) extend(segment,time);
    },
    snapshot(duration) {
      if(!Number.isFinite(duration)||duration<0) throw new Error('Invalid recording duration.');
      const copy=structuredClone(timeline);copy.duration=duration;
      copy.segments=copy.segments.filter(s=>s.start<duration).map(s=>({...s,
        release:Math.min(s.release,duration),end:Math.min(s.end,duration),
        keyframes:s.keyframes.filter(k=>k.time<Math.min(s.release,duration)),
      }));
      return validateZoomTimeline(copy);
    },
  };
}

// Rebuild the automatic suggestion from original motion metadata, for an
// editor's "regenerate" action. Existing hand-edited documents are not mutated.
export function generateZoomTimeline(events,duration,options) {
  if(!Array.isArray(events)||!Number.isFinite(duration)||duration<0) throw new Error('Invalid recording motion.');
  const motion=createZoomMotion(options);
  for(const event of events.filter(e=>e && Number.isFinite(e.time) && e.time>=0 && e.time<duration).slice().sort((a,b)=>a.time-b.time)) {
    if(event.type==='click') motion.click(event.x,event.y,event.time);
    else if(event.type==='pointer') motion.pointer(event,event.time);
    else if(event.type==='activity') motion.activity(event.kind,event.x,event.y,event.time);
  }
  return motion.snapshot(duration);
}
