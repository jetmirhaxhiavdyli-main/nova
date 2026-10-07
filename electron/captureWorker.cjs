// Isolated native/driver calls. Pixels go directly to the renderer's port.
let capture, first, options, native, port, busy=false, paused=false, crop, sourceSize;
async function begin(){capture=new native.ScreenCapture(options);await capture.start();first=await capture.nextFrame();if(!first)throw Error('The selected source did not produce a frame.');}
async function start(message){
  native=await import('@screen-capture/node');
  if(!native.isSupported()||!native.captureApiSupport().cursorSettings)throw Error('Cursor-free capture is unavailable.');
  let target;
  if(message.sourceId.startsWith('window:'))target={windowHandle:Number(message.sourceId.split(':')[1])};
  else {
    const d=message.display;if(!d)throw Error('Cannot identify this display.');
    const matches=native.enumerateMonitors().filter(m=>m.name===d.label&&Math.abs(m.width-d.size.width*d.scaleFactor)<2&&Math.abs(m.height-d.size.height*d.scaleFactor)<2);
    const monitor=d.id===message.primaryId?native.primaryMonitor():matches.length===1?matches[0]:null;
    if(!monitor)throw Error('Cannot identify this display for smooth cursor capture.');
    target={monitorIndex:monitor.index};
  }
  options={...target,cursorCapture:false,drawBorder:false,colorFormat:'rgba8',minimumUpdateIntervalMs:message.record?Math.floor(500/message.fps):message.fps===60?16:33};
  const {cropPixels}=await import('./captureGeometry.mjs');
  await begin();sourceSize={width:first.width,height:first.height};
  crop=message.selection?cropPixels(message.selection.area,message.selection.geometry,message.selection.viewport,sourceSize):null;
  const width=crop?.width||first.width,height=crop?.height||first.height;
  if(message.record)await startEncoder(message.record,message.fps,width,height);
  process.parentPort.postMessage({type:'ready',info:{sourceSize,crop,width,height,fps:message.fps,encoded:!!message.record,encoder:rec?.encoder}});
}
// Recording mode: frames never reach the renderer. The latest captured frame is written to ffmpeg at a constant
// frame rate (like OBS), so the file has exact timing and no MediaRecorder rate control or dropped frames.
let rec, latest;
const grab=frame=>crop?frame.crop(crop.x,crop.y,crop.x+crop.width,crop.y+crop.height):frame;
// Hardware H.264 encoders first (they keep up at 60 fps on big screens and leave the CPU free), x264 as the fallback.
// Quality-targeted (constant quality), not bitrate-targeted. Hardware H.264 tops out at 4096 pixels wide.
const HARDWARE=[
  ['h264_nvenc',['-preset','p5','-tune','hq','-rc','vbr','-cq','17','-b:v','0'],'yuv420p'],
  ['h264_amf',['-quality','quality','-rc','cqp','-qp_i','17','-qp_p','19'],'yuv420p'],
  ['h264_qsv',['-preset','slow','-global_quality','17'],'nv12'],
];
const HARDWARE_MAX=4096;
const probeEncoder=(ffmpeg,name,opts,pix,w,h)=>new Promise(resolve=>require('node:child_process').execFile(ffmpeg,
  ['-v','error','-f','lavfi','-i',`color=black:s=${w}x${h}:r=30`,'-frames:v','3','-vf',`format=${pix}`,'-c:v',name,...opts,'-f','null','-'],{windowsHide:true,timeout:4000},error=>resolve(!error)));
async function pickEncoder(ffmpeg,width,height){
  const w=Math.min(width,HARDWARE_MAX)+Math.min(width,HARDWARE_MAX)%2,h=Math.round(height*w/width/2)*2;
  for(const [name,opts,pix] of HARDWARE)if(await probeEncoder(ffmpeg,name,opts,pix,w,h))return {name,opts,pix,maxWidth:HARDWARE_MAX};
  // ponytail: x264 on a very large screen can't keep 60 fps; it is scaled down and uses the fastest preset.
  const big=width*height>2560*1440;
  return {name:'libx264',opts:['-preset',big?'ultrafast':'veryfast','-crf','16','-profile:v','high'],pix:'yuv420p',maxWidth:big?3840:Infinity};
}
async function startEncoder({ffmpeg,file},fps,width,height){
  const {spawn}=require('node:child_process');
  const enc=await pickEncoder(ffmpeg,width,height),shrink=width>enc.maxWidth;
  // yuv420p needs even sizes (an odd crop gets a one-pixel edge). One frame is written per 1/fps of recorded time (pauses excluded).
  // ponytail: an encoder slower than real time makes the video shorter than the recording.
  const args=['-hide_banner','-loglevel','error','-f','rawvideo','-framerate',String(fps),'-pix_fmt','rgba','-s',`${width}x${height}`,'-i','pipe:0',
    '-vf',`pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0,scale=${shrink?enc.maxWidth:'iw'}:${shrink?'-2':'ih'}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=${enc.pix}`,
    '-c:v',enc.name,...enc.opts,'-g',String(fps),
    '-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-color_range','tv','-f','matroska','-y',file];
  const child=spawn(ffmpeg,args,{windowsHide:true,stdio:['pipe','ignore','pipe']});
  rec={child,fps,file,encoder:enc.name,written:0,go:false,paused:false,t0:0,pausedAt:0,pausedMs:0,dead:null,errors:''};
  child.stderr.on('data',d=>{rec.errors=(rec.errors+d).slice(-3000);});
  child.stdin.on('error',()=>{});
  rec.closed=new Promise(resolve=>child.on('close',code=>{if(code!==0&&!rec.finishing)rec.dead=rec.errors||`Encoder exited with code ${code}.`;resolve(code);}));
  child.on('error',e=>{rec.dead=e.message;});
  child.stdin.on('drain',pump);
  rec.timer=setInterval(pump,4);
  latest=grab(first);void pull();
  await new Promise(r=>setTimeout(r,250)); // an invalid encoder setup fails fast; report it now rather than mid-recording
  if(rec.dead)throw Error(rec.dead);
}
async function pull(){
  const mine=capture;
  try{while(rec&&!rec.finishing&&!rec.paused&&capture===mine){const frame=await mine.nextFrame();if(!frame)break;if(rec.paused||capture!==mine)break;latest=grab(frame);}}
  catch(error){if(rec)rec.dead=error.message;}
}
function pump(){
  if(!rec||!rec.go||rec.paused||rec.finishing||!latest)return;
  let due=Math.floor((performance.now()-rec.t0-rec.pausedMs)*rec.fps/1000)-rec.written;
  // Backpressure: a slow encoder repeats the newest frame instead of growing a queue, and the timeline stays real-time.
  while(due-- >0&&!rec.child.stdin.writableNeedDrain){rec.child.stdin.write(latest.buffer);rec.written++;}
}
async function recCommand(type){
  if(!rec)throw Error('Not recording.');
  if(rec.dead)throw Error(rec.dead);
  if(type==='go'){rec.t0=performance.now();rec.go=true;}
  else if(type==='pause'){rec.paused=true;rec.pausedAt=performance.now();await capture?.stop();}
  else if(type==='resume'){await begin();latest=grab(first);first=null;rec.pausedMs+=performance.now()-rec.pausedAt;rec.paused=false;void pull();}
  else if(type==='finish'){
    rec.finishing=true;clearInterval(rec.timer);await capture?.stop().catch(()=>{});
    rec.child.stdin.end();const code=await rec.closed;
    if(code!==0)throw Error(rec.errors||`Encoder exited with code ${code}.`);
  }
}
async function command(m){
  if(busy&&m.type==='frame'){port.postMessage({request:m.request,error:'A frame is already pending.'});return;}
  try{
    if(m.type==='ping'){port.postMessage({request:m.request,ok:true});return;}
    if(m.type==='pause'){paused=true;await capture?.stop();first=null;port.postMessage({request:m.request,ok:true});return;}
    if(m.type==='resume'){await begin();paused=false;port.postMessage({request:m.request,ok:true});return;}
    if(m.type!=='frame')return;
    busy=true;let frame=first;first=null;if(!frame&&!paused)frame=await capture.nextFrame();
    if(paused){port.postMessage({request:m.request,paused:true});return;}
    if(!frame){port.postMessage({request:m.request,ended:true});return;}
    if(crop){if(frame.width!==sourceSize.width||frame.height!==sourceSize.height)throw Error('Display size changed during area recording.');frame=frame.crop(crop.x,crop.y,crop.x+crop.width,crop.y+crop.height);}
    port.postMessage({request:m.request,frame:{width:frame.width,height:frame.height,pixels:frame.buffer}});
  }catch(error){port.postMessage({request:m.request,error:error.message});}
  finally{if(m.type==='frame')busy=false;}
}
process.parentPort.on('message',event=>{
  if(event.data.type==='start')start(event.data).catch(e=>process.parentPort.postMessage({error:e.message}));
  if(event.data.type==='rec')recCommand(event.data.command).then(()=>process.parentPort.postMessage({type:'ack',request:event.data.request}),e=>process.parentPort.postMessage({type:'ack',request:event.data.request,error:e.message}));
  if(event.data.type==='port'){port=event.ports[0];port.on('message',e=>void command(e.data));port.start();}
});
