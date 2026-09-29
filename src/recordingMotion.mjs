import {createZoomMotion} from './autoZoom.mjs';
import {validPoint} from './zoomTimeline.mjs';
// Collect editable effects without drawing or encoding a second video.
export function recordMotion({bridge,sourceSize,crop=null,zoomEnabled,clock,isPaused}){
  const motion=createZoomMotion({enabled:zoomEnabled}),events=[];
  const bounds=crop||{x:0,y:0,...sourceSize};
  const map=p=>({x:(p.x*sourceSize.width-bounds.x)/bounds.width,y:(p.y*sourceSize.height-bounds.y)/bounds.height});
  const off=[
    bridge.onRecordingClick(p=>{if(isPaused())return;const point=map(p),time=clock();if(!validPoint(point.x,point.y))return;motion.click(point.x,point.y,time);events.push({type:'click',...point,time});}),
    bridge.onRecordingPointer(p=>{if(isPaused())return;const point=map(p),time=clock(),mapped=p.visible!==false&&validPoint(point.x,point.y)?{...point,visible:true}:{visible:false};motion.pointer(mapped,time);events.push({type:'pointer',...mapped,time});}),
    bridge.onRecordingActivity(p=>{if(isPaused())return;const point=map(p),time=clock();if(!validPoint(point.x,point.y))return;motion.activity(p.kind,point.x,point.y,time);events.push({type:'activity',kind:p.kind,...point,time});}),
  ];
  return {events,snapshot:duration=>motion.snapshot(duration),dispose:()=>off.forEach(f=>f?.())};
}
