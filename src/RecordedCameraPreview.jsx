import React, {useEffect,useRef} from 'react';
import {paintCamera} from './editorExport.mjs';
import {createCameraSync} from './syncRecordedCamera.mjs';

/** Read-only camera layer, synchronized to the finished modal's screen video. */
export default function RecordedCameraPreview({url,screen}) {
  const canvas=useRef(null);
  useEffect(()=>{
    if(!url)return;
    const camera=document.createElement('video');camera.muted=true;camera.src=url;camera.preload='auto';
    const sync=createCameraSync(camera);
    let frame;
    const draw=()=>{
      const v=screen.current,c=canvas.current;
      if(v&&c&&v.videoWidth){
        const box=v.getBoundingClientRect(),parent=c.parentElement.getBoundingClientRect();
        const scale=Math.min(box.width/v.videoWidth,box.height/v.videoHeight);
        const width=v.videoWidth*scale,height=v.videoHeight*scale;
        Object.assign(c.style,{left:`${box.left-parent.left+(box.width-width)/2}px`,top:`${box.top-parent.top+(box.height-height)/2}px`,width:`${width}px`,height:`${height}px`});
        if(c.width!==v.videoWidth||c.height!==v.videoHeight){c.width=v.videoWidth;c.height=v.videoHeight;}
        sync(v.currentTime,!v.paused&&!v.ended);
        const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
        if(camera.readyState>=2)paintCamera(ctx,camera,c.width,c.height);
      }
      frame=requestAnimationFrame(draw);
    };
    frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);camera.pause();camera.removeAttribute('src');camera.load();};
  },[url,screen]);
  return url?<canvas ref={canvas} aria-hidden="true" style={{position:'absolute',pointerEvents:'none'}}/>:null;
}
