/** Follow the screen clock without repeatedly interrupting camera decoding. */
export function createCameraSync(video,now=()=>performance.now()) {
  let lastSeek=-Infinity,seekCost=0,measuring=false,playPending=false;
  return (time,playing)=>{
    if(video.readyState<1)return;
    // How long the last seek took (s): a slow seek lands behind a moving playhead, so the next one aims ahead.
    if(measuring&&!video.seeking){measuring=false;seekCost=Math.min(2,(now()-lastSeek)/1000);}
    const clampTime=t=>Number.isFinite(video.duration)?Math.min(t,Math.max(0,video.duration-.001)):t;
    const target=clampTime(time);
    const drift=target-video.currentTime;
    if(!playing){
      video.pause();video.playbackRate=1;
      if(!video.seeking&&Math.abs(drift)>.02)video.currentTime=target;
      return;
    }
    // A seek is asynchronous: reassigning currentTime each frame can starve the decoder.
    if(!video.seeking&&Math.abs(drift)>.5&&now()-lastSeek>Math.max(750,seekCost*1000)){
      lastSeek=now();measuring=true;video.currentTime=clampTime(time+seekCost);
    }
    video.playbackRate=Math.abs(drift)<.04?1:Math.max(.95,Math.min(1.05,1+drift*.1));
    if(video.paused&&!video.ended&&!playPending){
      playPending=true;video.play().catch(()=>{}).finally(()=>{playPending=false;});
    }
  };
}
