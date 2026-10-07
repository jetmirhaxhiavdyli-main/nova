import { ZOOM_DEFAULTS, FULL_FRAME, validPoint, targetCrop, createZoomSampler, validateZoomTimeline } from './zoomTimeline.mjs';

// Online authoring of editable zoom segments. Rendering uses the same timeline
// sampler that an editor can use later, so there is no separate "preview" curve.
export function createZoomMotion({ enabled = true, holdMs } = {}) {
  const timeline = { version: 1, timebase: 'ms', enabled, duration: null, defaults: { ...ZOOM_DEFAULTS, ...(holdMs && { holdMs }) }, segments: [] };
  let active = null, last = null, pointer = null, sequence = 0, dirty = true, sampler;
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
    // Leaving the safe region re-centres on the pointer in one soft move (fewer, larger pans look smoother than a
    // stream of tiny nudges).
    const next = {x,y};
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
      // A click soon after a zoom ended continues that zoom instead of zooming out and straight back in.
      if(!segment && last && time-last.release<settings.mergeMs && time>=last.release) {segment=active=last;}
      if(!segment) {
        segment={id:`zoom-${++sequence}`,origin:'automatic',enabled:true,start:time,
          release:time+settings.holdMs,end:time+settings.holdMs+settings.returnMs,
          scale:settings.scale,target:{x,y},keyframes:[],
          easing:{zoom:settings.zoomSpring,pan:settings.panSpring,out:settings.returnSpring}};
        timeline.segments.push(segment);active=last=segment;dirty=true;
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
      // Moving the mouse only follows it; clicks, typing and scrolling keep the zoom alive, so it always returns.
      if(segment && moved) reframe(segment,point.x,point.y,time,'pointer');
    },
    activity(kind,x,y,time) {
      if(!['typing','scroll'].includes(kind)||!validPoint(x,y)||!Number.isFinite(time)||time<0) return;
      const segment=current(time);
      if(segment) extend(segment,time);
    },
    snapshot(duration) {
      if(!Number.isFinite(duration)||duration<0) throw new Error('Invalid recording duration.');
      const copy=structuredClone(timeline);copy.duration=duration;
      // A zoom still open at the end of the clip is released early enough to finish zooming out before it ends.
      copy.segments=copy.segments.filter(s=>s.start<duration).map(s=>{
        const early=Math.max(s.start+1500,duration-settings.returnMs); // clips too short to zoom in and out keep their last framing
        const release=Math.min(s.release,early>=duration?duration:early);
        return {...s,release,end:Math.min(release+settings.returnMs,duration),keyframes:s.keyframes.filter(k=>k.time<release)};
      });
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
