// Deterministic integration check: no physical camera or microphone is accessed.
if(!process.versions.electron){
 const child=require('node:child_process').spawn(require('electron'),[__filename],{windowsHide:true,stdio:'inherit',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
 child.on('exit',code=>process.exit(code||0));
 return;
}
const electron=require('electron');
const _electron={async launch({args}){
 electron.app.setPath('userData',args.find(a=>a.startsWith('--user-data-dir=')).split('=').slice(1).join('='));
 electron.app.setPath('desktop',electron.app.getPath('userData')); // isolate generated test exports
 electron.app.commandLine.appendSwitch('use-fake-device-for-media-stream');
 const loaded=new Promise(resolve=>electron.app.once('browser-window-created',(_e,w)=>w.webContents.once('did-finish-load',()=>resolve(w))));
 require('../electron/main.cjs');
 return {async firstWindow(){const w=await loaded;return {locator:()=>({waitFor:async()=>{}}),evaluate:fn=>w.webContents.executeJavaScript(`(${fn.toString()})()`,true)};},evaluate:async fn=>fn(electron),close:async()=>electron.app.exit(process.exitCode||0)};
}};
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-camera-check-'));
 const app=await _electron.launch({executablePath:require('electron'),args:[path.resolve(__dirname,'..'),'--user-data-dir='+profile,'--use-fake-device-for-media-stream'],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
 try{
  const page=await app.firstWindow();await page.locator('.toolbar').waitFor();
  const result=await page.evaluate(async()=>{
   const {recordCamera}=await import('../src/cameraRecording.mjs');
   const {paintCamera,exportEditor}=await import('../src/editorExport.mjs');
   const {cameraRect}=await import('../src/components/editor/constants.js');
   const {prepareRecordingInputs}=await import('../src/recordingStartup.mjs');
   let mic;const timings={};
   const ready=await prepareRecordingInputs({prepare:async()=>{mic=await navigator.mediaDevices.getUserMedia({audio:true});return {mic};},release:()=>mic?.getTracks().forEach(t=>t.stop())},async()=>{
    const stream=await navigator.mediaDevices.getUserMedia({video:true});return {stream,dispose:()=>stream.getTracks().forEach(t=>t.stop())};
   },(stage,ms)=>timings[stage]=Math.round(ms));
   const stream=new MediaStream([...ready.capture.stream.getTracks(),...ready.devices.mic.getTracks()]);
   const camera=recordCamera(new MediaStream(stream.getVideoTracks()),'video/webm;codecs=vp8');
   const main=recordCamera(stream,'video/webm;codecs=vp8,opus');
   main.recorder.start(100);camera.recorder.start(100);await new Promise(r=>setTimeout(r,450));
   main.recorder.pause();camera.recorder.pause();await new Promise(r=>setTimeout(r,100));main.recorder.resume();camera.recorder.resume();await new Promise(r=>setTimeout(r,450));
   const mainBlob=await main.finish();
   const blob=await camera.finish();stream.getTracks().forEach(t=>t.stop());
   const mainUrl=URL.createObjectURL(mainBlob),cameraUrl=URL.createObjectURL(blob);
   const {createCameraSync}=await import('../src/syncRecordedCamera.mjs');
   const screenVideo=document.createElement('video'),cameraVideo=document.createElement('video');
   cameraVideo.muted=true;screenVideo.volume=.01;
   await Promise.all([[screenVideo,mainUrl],[cameraVideo,cameraUrl]].map(([video,url])=>new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;video.src=url;})));
   const sync=createCameraSync(cameraVideo);await screenVideo.play();
   const tick=setInterval(()=>sync(screenVideo.currentTime,!screenVideo.paused),16);
   await new Promise(r=>setTimeout(r,450));
   const playback={screen:screenVideo.currentTime,camera:cameraVideo.currentTime};
   clearInterval(tick);screenVideo.pause();cameraVideo.pause();
   for(const video of [screenVideo,cameraVideo]){video.removeAttribute('src');video.load();}
   let frameCount=0,finished=false,audioBytes=0,filePath;
   await exportEditor({url:mainUrl,camera:{url:cameraUrl},hasMic:true,events:[],clicks:[]},{duration:.8,trim:{start:.1,end:.7},output:{size:'original'},background:{mode:'none',padding:0},video:{roundness:0,shadow:0},cursor:{hidden:true},audio:{music:'none',voice:100},zooms:[],splits:[]},{format:'MP4',fps:24,quality:'source',destination:'file'}, {
    editorExportStart:async options=>{audioBytes=options.audioSource?.length||0;await window.recorder.editorExportStart(options);},editorExportFrame:async bytes=>{frameCount++;await window.recorder.editorExportFrame(bytes);},editorExportFinish:async()=>{const result=await window.recorder.editorExportFinish();finished=true;filePath=result.filePath;return result;},editorExportDispose:()=>window.recorder.editorExportDispose()
   },new AbortController().signal,()=>{});
   URL.revokeObjectURL(mainUrl);URL.revokeObjectURL(cameraUrl);
   const v=document.createElement('video');v.muted=true;v.src=URL.createObjectURL(blob);await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});
   const dims=[v.videoWidth,v.videoHeight];URL.revokeObjectURL(v.src);v.removeAttribute('src');v.load();
   const source=document.createElement('canvas');source.width=100;source.height=100;const s=source.getContext('2d');s.fillStyle='red';s.fillRect(0,0,50,100);s.fillStyle='blue';s.fillRect(50,0,50,100);
   const out=document.createElement('canvas');out.width=400;out.height=300;const c=out.getContext('2d'),settings={visible:true,x:.5,y:.5,size:.4,shape:'circle',mirror:false};
   const rect=cameraRect(400,300,settings),at=(x,y)=>Array.from(c.getImageData(x,y,1,1).data);
   c.translate(100,100);c.scale(2,2);paintCamera(c,source,400,300,settings);
   const left=at(rect.x+rect.width*.25,rect.y+rect.height*.5),corner=at(rect.x,rect.y);
   paintCamera(c,source,400,300,{...settings,mirror:true});const mirrored=at(rect.x+rect.width*.25,rect.y+rect.height*.5);
   c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,400,300);paintCamera(c,source,400,300,{...settings,visible:false});
   return {bytes:blob.size,dims,left,corner,mirrored,hidden:at(200,150),stopped:stream.getTracks().every(t=>t.readyState==='ended'),timings,frameCount,finished,audioBytes,filePath,playback};
  });
  assert(result.bytes>1000);assert(result.dims.every(n=>n>0));assert(result.stopped);
  assert(result.finished);assert.equal(result.frameCount,15);assert(result.audioBytes>1000);
  assert(result.playback.screen>.2);assert(result.playback.camera>.2);
  const {probe,run}=require('../electron/export.cjs');
  const info=await probe(result.filePath);assert(Math.abs(info.duration-.6)<.08);
  const tracks=JSON.parse(await run(require('ffprobe-static').path,['-v','error','-show_streams','-of','json',result.filePath])).streams;
  assert(tracks.some(t=>t.codec_type==='audio'));assert(tracks.some(t=>t.codec_type==='video'));
  assert.deepEqual(result.left,[255,0,0,255]);assert.equal(result.corner[3],0);assert.deepEqual(result.mirrored,[0,0,255,255]);assert.equal(result.hidden[3],0);
  console.log('Camera permissions, separate recording, pause/resume, decoding, crop/mirror/hidden geometry and cleanup passed.',result);
 }catch(e){console.error(e);process.exitCode=1;}finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await app.close();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
