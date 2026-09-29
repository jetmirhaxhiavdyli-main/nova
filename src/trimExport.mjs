import {motionTimeline} from './editorMotion.mjs';

export function trimRange(edits) {
  const start=edits.trim?.start ?? 0,end=edits.trim?.end ?? edits.duration;
  if(![start,end,edits.duration].every(Number.isFinite)||start<0||end>edits.duration||end<=start) throw Error('Invalid trim range.');
  return {start,end,duration:end-start};
}

// Derived export data only. Project edits keep their original recording times.
export function prepareTrimmedExport(recording,edits) {
  const {start,end,duration}=trimRange(edits),a=start*1000,b=end*1000;
  const timeline=motionTimeline(edits.zooms,edits.duration,recording.events);
  const segments=timeline.segments.filter(s=>s.start<b && s.end>a).map(s=>{
    const prior=s.keyframes.filter(k=>k.time<=a).at(-1);
    const segment={...s,start:Math.max(0,s.start-a),end:Math.min(b,s.end)-a,
      target:structuredClone(prior?.target || s.target),
      keyframes:s.keyframes.filter(k=>k.time>a&&k.time<b).map(k=>({...k,time:k.time-a}))};
    segment.release=Math.min(segment.end,Math.max(segment.start+Math.min(.001,segment.end-segment.start),s.release-a));
    segment.keyframes=segment.keyframes.filter(k=>k.time<segment.release);
    return segment;
  });
  const events=(recording.events||[]).filter(e=>e.time>=a&&e.time<b).map(e=>({...e,time:e.time-a}));
  const prior=(recording.events||[]).filter(e=>e.type==='pointer'&&e.time<a).at(-1);
  if(prior && !events.some(e=>e.type==='pointer'&&e.time===0))events.unshift({...prior,time:0});
  return {
    sourceStart:start,
    recording:{...recording,duration,events,clicks:(recording.clicks||[]).filter(t=>t>=start&&t<end).map(t=>t-start),
      cursor:recording.cursor?.filter(p=>p[0]>=start&&p[0]<end).map(([t,...p])=>[t-start,...p]),
      // Pre-cut motion history is sampled privately to retain position AND velocity.
      motionSource:{events:recording.events||[],edits,offset:start}},
    edits:{...structuredClone(edits),duration,trim:{start:0,end:duration},
      zoomTimeline:{...timeline,duration:duration*1000,segments},
      zooms:segments.map(s=>({...edits.zooms.find(z=>z.id===s.id),start:s.start/1000,end:s.end/1000,focus:s.target,original:s})),
      splits:(edits.splits||[]).filter(s=>s.t>start&&s.t<end).map(s=>({...s,t:s.t-start}))},
  };
}
