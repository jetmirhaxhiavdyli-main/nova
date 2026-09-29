import { createZoomSampler, ZOOM_DEFAULTS } from './zoomTimeline.mjs';
import { generateZoomTimeline } from './autoZoom.mjs';

// UI seconds are an adapter only: the source motion document remains intact.
export function editorZooms(timeline) {
  return (timeline?.segments || []).map(s => ({ id:s.id, start:s.start/1000, end:s.end/1000,
    level:s.scale, mode:'auto', instant:false, focus:{...s.target},
    enabled:timeline.enabled && s.enabled, original:structuredClone(s) }));
}

export function motionTimeline(zooms, duration, events=[]) {
  const segments = zooms.filter(z => z.end > z.start).map(z => {
    const start=z.start*1000, end=Math.min(duration*1000,z.end*1000), old=z.original;
    const ratio=old ? (end-start)/(old.end-old.start) : 1;
    const release=old ? start+(old.release-old.start)*ratio : Math.max(start+1,end-Math.min(ZOOM_DEFAULTS.returnMs,(end-start)/2));
    const generated = !old && z.mode === 'auto' ? generateZoomTimeline([
      {type:'click',time:start,x:z.focus.x,y:z.focus.y},
      ...events.filter(e=>e.time>start && e.time<release),
    ],duration*1000).segments.flatMap(s=>s.keyframes).filter(k=>k.time<release) : [];
    return { ...old, id:z.id, enabled:z.enabled !== false, start, end, release,
      scale:z.level, target:{...z.focus}, instant:!!z.instant,
      easing:old?.easing || {zoom:ZOOM_DEFAULTS.zoomSpring,pan:ZOOM_DEFAULTS.panSpring,out:ZOOM_DEFAULTS.returnSpring},
      keyframes:z.mode === 'fixed' ? [] : old ? old.keyframes.map(k=>({...k,time:start+(k.time-old.start)*ratio})) : generated };
  });
  return {version:1,timebase:'ms',enabled:true,duration:duration*1000,defaults:{...ZOOM_DEFAULTS},segments};
}

export function editorCamera(zooms,duration,events) { return createZoomSampler(motionTimeline(zooms,duration,events)); }

// Offline smoothing is centred on recording time, so constant-speed travel
// has no spring lag. Never blend across visibility gaps.
export function editorCursor(events, smoothness=70) {
  const points=events.filter(e=>Number.isFinite(e.time)&&(e.type==='pointer'||e.type==='click')&&
    (e.visible===false||(Number.isFinite(e.x)&&Number.isFinite(e.y))))
    .slice().sort((a,b)=>a.time-b.time||Number(a.type==='click')-Number(b.type==='click'));
  let segment=0;
  const samples=points.map(p=>{if(p.visible===false)segment++;return {...p,segment};});
  const radius=Math.max(0,Math.min(100,smoothness))*1.5;
  function raw(t) {
    let low=0,high=samples.length;
    while(low<high){const mid=(low+high)>>>1;if(samples[mid].time<=t)low=mid+1;else high=mid;}
    const p=samples[low-1],next=samples[low];
    if(!p||p.visible===false)return null;
    if(!next||next.visible===false||next.segment!==p.segment||next.time===p.time)return p;
    const k=(t-p.time)/(next.time-p.time);
    return {...p,x:p.x+(next.x-p.x)*k,y:p.y+(next.y-p.y)*k};
  }
  const clicks=samples.filter(p=>p.type==='click'&&p.visible!==false);
  return t=>{
    const centre=raw(t);if(!centre)return null;
    if(!radius)return {x:centre.x,y:centre.y};
    let x=0,y=0,weight=0;
    for(let i=-8;i<=8;i++){
      const p=raw(t+radius*i/8);
      if(!p||p.segment!==centre.segment)continue;
      const w=9-Math.abs(i);x+=p.x*w;y+=p.y*w;weight+=w;
    }
    x/=weight;y/=weight;
    // A narrow continuous correction anchors clicks without a long raw-motion
    // interval that changes the cursor's feel before and after every click.
    let nearest=null,distance=Infinity;
    for(const c of clicks){const d=Math.abs(c.time-t);if(c.segment===centre.segment&&d<distance){distance=d;nearest=c;}}
    if(nearest&&distance<60){
      const u=1-distance/60,w=u*u*(3-2*u);
      x+=(centre.x-x)*w;y+=(centre.y-y)*w;
    }
    return {x,y};
  };
}
