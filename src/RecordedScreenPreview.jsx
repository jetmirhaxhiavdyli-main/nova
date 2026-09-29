import React, {useEffect,useRef} from 'react';
import {createCompositionPainter} from './editorExport.mjs';
import {reviewEdits} from './reviewEdits.mjs';

// The video remains the audio/playback clock. Only effects are drawn here, after capture has stopped.
export default function RecordedScreenPreview({screen,recording}) {
  const canvas=useRef(null);
  useEffect(()=>{
    const video=screen.current,surface=canvas.current;if(!video||!surface)return;
    let paint,frame;
    const draw=()=>{if(paint&&video.readyState>=2)paint(video.currentTime);};
    const stop=()=>{if(frame!==undefined)video.cancelVideoFrameCallback(frame);frame=undefined;};
    const tick=()=>{draw();if(!video.paused&&!video.ended)frame=video.requestVideoFrameCallback(tick);};
    const play=()=>{stop();draw();frame=video.requestVideoFrameCallback(tick);};
    const ready=()=>{
      if(!video.videoWidth||!video.videoHeight)return;
      video.width=video.videoWidth;video.height=video.videoHeight;
      paint=createCompositionPainter(surface,video,recording,reviewEdits(recording));draw();
      if(!video.paused)play();
    };
    video.addEventListener('loadeddata',ready);video.addEventListener('seeked',draw);
    video.addEventListener('play',play);video.addEventListener('pause',stop);
    ready();
    return()=>{stop();video.removeEventListener('loadeddata',ready);video.removeEventListener('seeked',draw);video.removeEventListener('play',play);video.removeEventListener('pause',stop);};
  },[screen,recording]);
  return <canvas ref={canvas} aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',pointerEvents:'none'}}/>;
}
