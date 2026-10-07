import { IMAGE_FILL, outputDims, animatedBackground, animatedBackgroundFrame, backgroundKind, blurredImageRect, imageBlurPx, imageRect, imageSrc, presetGradient } from './components/editor/constants.js';
import { editorCamera, editorCursor } from './editorMotion.mjs';
import { prepareTrimmedExport } from './trimExport.mjs';
import { cutPlan, mapClicks } from './cutExport.mjs';
import { pickFrame } from './frameSelect.mjs';
import { CAMERA_DEFAULTS, cameraRect } from './components/editor/constants.js';

export function paintCamera(c,source,width,height,settings) {
  const camera={...CAMERA_DEFAULTS,...settings};
  if(!source||!camera.visible)return;
  const r=cameraRect(width,height,camera),sw=source.videoWidth||source.width,sh=source.videoHeight||source.height;
  if(!sw||!sh)return;
  const scale=Math.max(r.width/sw,r.height/sh),dw=sw*scale,dh=sh*scale;
  c.save();c.setTransform(1,0,0,1,0,0);c.beginPath();c.roundRect(r.x,r.y,r.width,r.height,r.radius);c.clip();
  c.translate(r.x+r.width/2,r.y+r.height/2);if(camera.mirror)c.scale(-1,1);
  c.drawImage(source,-dw/2,-dh/2,dw,dh);c.restore();
}

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function compositionLayout(source, edits) {
  const {width,height}=outputDims(edits.output,source);
  const pad=edits.background.mode==='none'?0:width*edits.background.padding/100;
  const vw=Math.min(Math.max(0,width-pad*2),Math.max(0,height-pad*2)*source.width/source.height),vh=vw*source.height/source.width;
  const maxX=(width-vw)/2,maxY=(height-vh)/2;
  return {width,height,vw,vh,vx:maxX+clamp((edits.video.position?.x||0)*width,-maxX,maxX),vy:maxY+clamp((edits.video.position?.y||0)*height,-maxY,maxY)};
}

/** `backgroundImage`: the loaded image when edits.background uses Presets → Image (see loadBackgroundImage). */
export function createCompositionPainter(canvas, source, recording, edits, backgroundImage = null, cameraSource = null) {
  const g=compositionLayout(source,edits),{width,height,vw,vh,vx,vy}=g;
  canvas.width=width;canvas.height=height;
  const c=canvas.getContext('2d',{alpha:false,willReadFrequently:false});
  // Recordings are usually larger than the output; 'high' keeps downscaled text sharp.
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  const motion=recording.motionSource;
  const animated=edits.background.mode==='preset' && backgroundKind(edits.background)==='animated' ? animatedBackground(edits.background.preset) : null;
  const camera=editorCamera(motion?.edits.zooms||edits.zooms,motion?.edits.duration||edits.duration,motion?.events||recording.events);
  const cursor=editorCursor(motion?.events||recording.events||[],edits.cursor.smoothness);
  // A blurred background image is rendered once (blur is too costly per frame), then copied each frame.
  let blurredBackground=null;
  const blurPx=backgroundImage?imageBlurPx(width,height,edits.background.image):0;
  if(blurPx>0) {
    blurredBackground=document.createElement('canvas');blurredBackground.width=width;blurredBackground.height=height;
    const b=blurredBackground.getContext('2d'),r=blurredImageRect(width,height,edits.background.image);
    b.filter=`blur(${blurPx}px)`;b.drawImage(backgroundImage,r.x,r.y,r.width,r.height);
  }
  const shape=new Path2D('M0 0 L0 16 L4.2 12.2 L7 18.5 L9.6 17.4 L6.9 11.2 L12.5 11.2 Z');
  const round=(x,y,w,h,r)=>{c.beginPath();c.roundRect(x,y,w,h,Math.max(0,Math.min(r,w/2,h/2)));};
  return time=>{
    c.save();c.setTransform(1,0,0,1,0,0);
    if(backgroundImage) c.fillStyle=edits.background.image.fill||IMAGE_FILL; // shows around an image smaller than the frame
    else if(animated) {
      const f=animatedBackgroundFrame(width,height,animated,time+(motion?.offset||0));
      const gradient=c.createLinearGradient(f.x0,f.y0,f.x1,f.y1);
      f.colors.forEach((color,i)=>gradient.addColorStop(i/(f.colors.length-1),color));c.fillStyle=gradient;
    }
    else if(edits.background.mode==='preset') {
      // CSS 135deg gradient's line passes through the centre at 45deg.
      const half=(width+height)/4,gradient=c.createLinearGradient(width/2-half,height/2-half,width/2+half,height/2+half);
      const colors=presetGradient(edits.background);gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);c.fillStyle=gradient;
    } else c.fillStyle=edits.background.mode==='color'?edits.background.color:'#000';
    c.fillRect(0,0,width,height);
    // Background image (Presets → Image), placed exactly as in the preview.
    if(blurredBackground) c.drawImage(blurredBackground,0,0);
    else if(backgroundImage) {const r=imageRect(width,height,edits.background.image);c.drawImage(backgroundImage,r.x,r.y,r.width,r.height);}
    const motionTime=(time+(motion?.offset||0))*1000;
    const z=camera(motionTime),scale=1/z.width;
    c.translate(vx-z.x*vw*scale,vy-z.y*vh*scale);c.scale(scale,scale);c.translate(-vx,-vy);
    const radius=edits.video.roundness,s=edits.video.shadow/100,edge=recording.windowCapture?2*vw/source.width:0;
    if(s>0) {c.save();c.beginPath();c.rect(-width*8,-height*8,width*16,height*16);c.roundRect(vx,vy,vw,vh,Math.min(radius,vw/2,vh/2));c.clip('evenodd');c.shadowOffsetY=4+18*s;c.shadowBlur=8+40*s;c.shadowColor=`rgba(0,0,0,${.15+.4*s})`;c.fillStyle='#000';round(vx,vy,vw,vh,radius);c.fill();c.restore();}
    c.save();round(vx,vy,vw,vh,radius);c.clip();round(vx+edge,vy+edge,Math.max(0,vw-2*edge),Math.max(0,vh-2*edge),radius);c.clip();c.drawImage(source,vx,vy,vw,vh);c.restore();
    const p=recording.cursorFree && !edits.cursor.hidden ? cursor(motionTime):null;
    if(p) {
      const x=vx+p.x*vw,y=vy+p.y*vh,glyph=(edits.cursor.style==='large'?1.4:1)*vw/960*1.3;
      const click=recording.clicks?.find(t=>time>=t && time<t+.5);
      if(click!==undefined) {const age=(time-click)/.5;c.save();c.globalAlpha=1-age;c.fillStyle='rgba(0,153,255,.2)';c.strokeStyle='#0099ff';c.lineWidth=1.5; c.beginPath();c.arc(x,y,14*(.3+1.1*age),0,Math.PI*2);c.fill();c.stroke();c.restore();}
      c.save();c.translate(x,y);c.scale(glyph,glyph);
      if(edits.cursor.style==='touch'){c.beginPath();c.arc(0,0,11,0,Math.PI*2);c.fillStyle='rgba(24,24,27,.5)';c.strokeStyle='#fff';c.lineWidth=2;c.fill();c.stroke();}
      else {c.fillStyle='#111113';c.strokeStyle='#fff';c.lineWidth=1.4;c.lineJoin='round';c.fill(shape);c.stroke(shape);}
      c.restore();
    }
    c.restore();
    paintCamera(c,cameraSource,width,height,edits.camera);
  };
}

export async function loadBackgroundImage(background) {
  if(background?.mode!=='preset'||backgroundKind(background)!=='image'||!background.image?.width) return null;
  const src=imageSrc(background.image);
  if(!src) throw Error('The background image is missing. Pick another image.');
  const image=new Image();image.src=src;
  try {await image.decode();} catch {throw Error('Could not load the background image.');}
  return image;
}

function waitVideo(video,event,action,signal) {
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener(event,ok);video.removeEventListener('error',bad);signal.removeEventListener('abort',abort);};
    const ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(Error('Could not decode the original recording.'));},abort=()=>{cleanup();reject(Error('Export cancelled.'));};
    const timer=setTimeout(bad,30000);
    video.addEventListener(event,ok,{once:true});video.addEventListener('error',bad,{once:true});signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted) abort();else action();
  });
}

/** Seeks to a frame's exact time and waits until the player has actually presented it. Drawing right after 'seeked' can still give the previous frame, which showed up as out-of-order and held frames in fast animations. */
async function showFrame(video,time,signal) {
  const presented=video.requestVideoFrameCallback?new Promise(resolve=>video.requestVideoFrameCallback(resolve)):null;
  await waitVideo(video,'seeked',()=>{video.currentTime=time;},signal);
  if(presented) await Promise.race([presented,new Promise(resolve=>setTimeout(resolve,500))]);
}
/** The recording's real frame times (uneven for a screen recording), or null to fall back to plain seeking. */
async function loadFrameTimes(recording,bridge,signal) {
  if(!bridge.frameTimes) return null;
  try {
    const bytes=new Uint8Array(await (await fetch(recording.url,{signal})).arrayBuffer());
    const times=await bridge.frameTimes(bytes);
    return Array.isArray(times)&&times.length>1?[...new Set(times)]:null;
  } catch(error) {if(signal.aborted) throw error;return null;}
}

export async function exportEditor(recording,edits,options,bridge,signal,onProgress,onMetrics = () => {}) {
  if(edits.audio.music!=='none') throw Error('Music tracks are not connected yet. Select None to export.');
  const removed=edits.removed||[];
  const trimmed=prepareTrimmedExport(recording,edits);
  recording=trimmed.recording;edits=trimmed.edits;
  // Deleted sections: video/both ranges are cut from the output, audio-only ranges mute the voice (src/cutExport.mjs).
  const plan=cutPlan(removed,trimmed.sourceStart,edits.duration);
  if(plan.outDuration<=0) throw Error('Everything is deleted. Restore a section to export.');
  const metrics={decodeMs:0,paintMs:0,packMs:0,transferMs:0,encodeMs:0,totalMs:0,frames:0};
  const beganAt=performance.now();
  const video=document.createElement('video');video.muted=true;video.preload='auto';
  const webcam=recording.camera?.url && edits.camera?.visible!==false ? document.createElement('video'):null;
  let begun=false;
  try {
    await waitVideo(video,'loadeddata',()=>{video.src=recording.url;video.load();},signal);
    if(webcam){webcam.muted=true;webcam.preload='auto';await waitVideo(webcam,'loadeddata',()=>{webcam.src=recording.camera.url;webcam.load();},signal);}
    // CanvasImageSource dimensions are exposed as width/height for the shared geometry.
    video.width=video.videoWidth;video.height=video.videoHeight;
    const backgroundImage=await loadBackgroundImage(edits.background);
    const canvas=document.createElement('canvas'),paint=createCompositionPainter(canvas,video,recording,edits,backgroundImage,webcam);
    const duration=plan.outDuration;
    if(!Number.isFinite(duration)||duration<=0) throw Error('Recording duration is unavailable.');
    const audioSegments=plan.segments.map(s=>({start:trimmed.sourceStart+s.start,end:trimmed.sourceStart+s.end}));
    const frameFormat=options.frameFormat || (canvas.width*canvas.height>=1280*720?'rgba':'png'); // Both lossless; raw skips PNG packing on large frames.
    const audioSource=recording.hasMic&&options.format!=='GIF'?new Uint8Array(await (await fetch(recording.url,{signal})).arrayBuffer()):undefined;
    await bridge.editorExportStart({...options,frameFormat,audioSource,audioStart:trimmed.sourceStart,audioSegments,audioMutes:plan.mutes,audioVolume:(edits.audio.voice??100)/100,width:canvas.width,height:canvas.height,duration,clicks:edits.cursor.clickSound&&!edits.cursor.hidden?mapClicks(recording.clicks,plan):[]});begun=true;
    const frames=Math.ceil(duration*options.fps);
    const times=await loadFrameTimes(recording,bridge,signal);let shown=-1;
    let lastProgress=-1;
    for(let i=0;i<frames;i++) {
      if(signal.aborted) throw Error('Export cancelled.');
      // t = trimmed-timeline time of this output frame (skips cut sections); the painter samples motion/clicks at t.
      const t=plan.toTrimmed(i/options.fps);
      const sourceTime=trimmed.sourceStart+t;
      let measuredAt=performance.now();
      if(times) {
        // Exact source frames, in order, each confirmed on screen before it is drawn (see showFrame).
        const k=pickFrame(times,sourceTime,options.fps);
        if(k!==shown) {const at=times[k]+0.0002;if(Math.abs(video.currentTime-at)>1e-7) await showFrame(video,at,signal);shown=k;}
      } else if(Math.abs(video.currentTime-sourceTime)>1e-7) await waitVideo(video,'seeked',()=>{video.currentTime=sourceTime;},signal);
      if(webcam){const ct=Number.isFinite(webcam.duration)?Math.min(sourceTime,Math.max(0,webcam.duration-.001)):sourceTime;
        if(Math.abs(webcam.currentTime-ct)>1e-7)await waitVideo(webcam,'seeked',()=>{webcam.currentTime=ct;},signal);}
      metrics.decodeMs+=performance.now()-measuredAt;measuredAt=performance.now();
      paint(t);
      metrics.paintMs+=performance.now()-measuredAt;measuredAt=performance.now();
      let bytes;
      if(frameFormat==='png') {
        const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not render a frame.')),'image/png'));
        bytes=new Uint8Array(await png.arrayBuffer());
      } else {
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        bytes=new Uint8Array(pixels.buffer,pixels.byteOffset,pixels.byteLength);
      }
      if(signal.aborted) throw Error('Export cancelled.');
      metrics.packMs+=performance.now()-measuredAt;measuredAt=performance.now();
      await bridge.editorExportFrame(bytes);
      metrics.transferMs+=performance.now()-measuredAt;metrics.frames++;
      const progress=Math.round((i+1)/frames*100);
      if(progress!==lastProgress) {lastProgress=progress;onProgress(progress);}
    }
    const encodingAt=performance.now();
    const result=await bridge.editorExportFinish();
    metrics.encodeMs=performance.now()-encodingAt;return result;
  } finally {
    video.removeAttribute('src');video.load();
    if(webcam){webcam.removeAttribute('src');webcam.load();}
    if(begun) await bridge.editorExportDispose();
    metrics.totalMs=performance.now()-beganAt;onMetrics(metrics);
  }
}
