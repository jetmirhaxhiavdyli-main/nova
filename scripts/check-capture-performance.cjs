// Native capture regression with a generated window; no personal desktop, camera or mic is recorded.
if(!process.versions.electron){
  const child=require('node:child_process').spawn(require('electron'),[__filename],{windowsHide:true,stdio:'inherit',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
  child.on('exit',code=>process.exit(code||0));return;
}
const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const timeout=setTimeout(()=>{console.error('Capture regression timed out');app.exit(1);},90000);
(async()=>{
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-capture-check-'));app.setPath('userData',profile);app.setPath('desktop',profile);
  const loaded=new Promise(resolve=>app.once('browser-window-created',(_e,w)=>w.webContents.once('did-finish-load',()=>resolve(w))));
  require('../electron/main.cjs');const window=await loaded;
  const fixture=new BrowserWindow({width:640,height:360,useContentSize:true,frame:false,show:true,alwaysOnTop:true,webPreferences:{backgroundThrottling:false}});
  await fixture.loadURL('data:text/html,'+encodeURIComponent('<html><body style="margin:0;overflow:hidden"><canvas width="640" height="360"></canvas><script>const c=document.querySelector("canvas").getContext("2d");let i=0;setInterval(()=>{c.fillStyle="#2468ac";c.fillRect(0,0,640,360);c.fillStyle="#efcc99";c.fillRect(64,36,320,180);c.fillStyle="#121212";c.font="20px Arial";c.fillText("Nova capture fixture "+(++i),80,80);c.fillStyle="#ff3344";c.fillRect(90+i%220,120,16,16);},33)</script></body></html>'));
  fixture.setTitle('Nova capture test fixture');fixture.show();
  await new Promise(r=>setTimeout(r,300));
  const sources=await require('electron').desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}});
  const source=sources.find(s=>s.id.split(':')[1]===fixture.getMediaSourceId().split(':')[1])?.id;
  assert(source,'Generated fixture is enumerated');
  try{
    const result=await window.webContents.executeJavaScript(`(async()=>{
      const {createNativeCapture}=await import('../src/nativeCapture.mjs');
      const wait=ms=>new Promise(r=>setTimeout(r,ms));const failures=[];
      const initial=performance.now();
      const full=await createNativeCapture(window.recorder,${JSON.stringify(source)},e=>failures.push(e?.message||'ended'),30);
      const fullSize=full.stream.getVideoTracks()[0].getSettings();full.dispose();
      const selection={area:{x:0,y:0,width:400/fullSize.width*640,height:224/fullSize.height*360},viewport:{width:640,height:360},geometry:{displayBounds:{x:0,y:0,width:640,height:360},overlayBounds:{x:0,y:0,width:640,height:360}}};
      const capture=await createNativeCapture(window.recorder,${JSON.stringify(source)},e=>failures.push(e?.message||'ended'),30,selection);
      const settings=capture.stream.getVideoTracks()[0].getSettings();
      const type=['video/webm;codecs=h264','video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
      const recorder=new MediaRecorder(capture.stream,{mimeType:type,videoBitsPerSecond:16000000,videoKeyFrameIntervalDuration:1000});
      const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.start(100);await wait(650);recorder.pause();await capture.setPaused(true);await wait(250);await capture.setPaused(false);recorder.resume();await wait(650);
      const stopped=new Promise(r=>recorder.onstop=r);recorder.stop();await stopped;capture.dispose();await wait(100);
      const blob=new Blob(chunks,{type});const url=URL.createObjectURL(blob),v=document.createElement('video');v.muted=true;v.src=url;
      await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});
      await v.play();await wait(120);v.pause();
      const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;canvas.getContext('2d').drawImage(v,0,0);
      const pixel=Array.from(canvas.getContext('2d').getImageData(100,100,1,1).data);
      const dims=[v.videoWidth,v.videoHeight];v.removeAttribute('src');v.load();URL.revokeObjectURL(url);
      return {fullSize,settings,dims,pixel,crop:capture.crop,sourceSize:capture.sourceSize,failures,ms:Math.round(performance.now()-initial),bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
    })()`,true);
    assert.deepEqual(result.failures,[]);assert.deepEqual(result.dims,[result.crop.width,result.crop.height]);assert.equal(result.fullSize.width,result.sourceSize.width);assert.equal(result.fullSize.height,result.sourceSize.height);
    assert.deepEqual(result.dims,[400,224]);
    for(const [i,c] of [239,204,153].entries())assert(Math.abs(result.pixel[i]-c)<8,`crop pixel ${result.pixel}`);
    const clip=path.join(profile,'capture.webm');await fs.writeFile(clip,Buffer.from(result.bytes));const bytes=result.bytes.length;delete result.bytes;
    const {probe,encode}=require('../electron/export.cjs');const exported=path.join(profile,'capture.mp4');
    await encode(clip,exported,{format:'MP4',fps:30,quality:'source',destination:'file'});
    const info=await probe(exported);assert(info.duration>=1&&info.duration<2.2,`duration ${info.duration}`);
    // Drive the real app from source selection through review and deferred-effects export.
    const js=code=>window.webContents.executeJavaScript(code,true);
    const until=async(code)=>{const end=Date.now()+20000;while(Date.now()<end){if(await js(code))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI wait failed: '+code);};
    await js(`Array.from(document.querySelectorAll('.toolbar button')).find(b=>b.textContent.trim()==='Window').click()`);
    await until(`Array.from(document.querySelectorAll('.picker-row')).some(b=>b.textContent.includes('Nova capture test fixture'))`);
    await js(`Array.from(document.querySelectorAll('.picker-row')).find(b=>b.textContent.includes('Nova capture test fixture')).click()`);
    await until(`document.querySelector('.panel__footer button')?.disabled===false`);
    await js(`document.querySelector('.panel__footer button').click()`);
    await until(`!!document.querySelector('.hud')`);
    window.webContents.send('recording-pointer',{x:.3,y:.3,visible:true});window.webContents.send('recording-click',{x:.3,y:.3});
    await new Promise(r=>setTimeout(r,800));window.webContents.send('recording-pointer',{x:.6,y:.5,visible:true});
    await new Promise(r=>setTimeout(r,800));window.webContents.send('stop');
    await until(`!!document.querySelector('.finished canvas')`);
    await until(`document.querySelector('.finished video')?.readyState>=2`);
    await js(`document.querySelector('.finished__play').click()`);
    await until(`document.querySelector('.finished video').currentTime>.3`);
    await js(`document.querySelector('.finished video').pause()`);
    const review=await js(`(()=>{const c=document.querySelector('.finished canvas');return {width:c.width,height:c.height,pixel:Array.from(c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data)}})()`);
    assert(review.width>600&&review.height>300);assert(review.pixel.slice(0,3).some(x=>x>10),'review draws the recording');
    await js(`Array.from(document.querySelectorAll('.finished__actions button')).find(b=>b.textContent.trim()==='Editor').click()`);
    await until(`!!document.querySelector('.editor-header') && !!document.querySelector('.editor video')`);
    await until(`document.querySelector('.editor video').readyState>=2`);
    await js(`document.querySelector('[aria-label="Back to your recording"]').click()`);
    await until(`!!document.querySelector('.finished__actions')`);
    await js(`Array.from(document.querySelectorAll('.finished__actions button')).find(b=>b.textContent.trim()==='Export').click()`);
    await until(`Array.from(document.querySelectorAll('.export button')).some(b=>b.textContent.includes('Export MP4'))`);
    await js(`Array.from(document.querySelectorAll('.export button')).find(b=>b.textContent.includes('Export MP4')).click()`);
    await until(`!!document.querySelector('.toolbar') && document.body.innerText.includes('Export successful')`);
    const saved=(await fs.readdir(profile)).find(f=>f.startsWith('Nova-')&&f.endsWith('.mp4'));assert(saved,'Finished-modal export writes MP4');
    const reviewExport=await probe(path.join(profile,saved));assert(reviewExport.duration>1&&reviewExport.duration<3);
    assert.equal(reviewExport.width,review.width+review.width%2);assert.equal(reviewExport.height,review.height+review.height%2);
    const log=await fs.readFile(path.join(profile,'logs/nova.log'),'utf8');assert(log.includes('"screenEncoders":1'));assert(log.includes('"path":"native"'));
    const dimsOnly=s=>({width:s.width,height:s.height,frameRate:s.frameRate});
    console.log(JSON.stringify({ok:true,...result,fullSize:dimsOnly(result.fullSize),settings:dimsOnly(result.settings),bytes,duration:info.duration,review,reviewExport:{width:reviewExport.width,height:reviewExport.height,duration:reviewExport.duration},profile}));
  }finally{fixture.destroy();window.destroy();clearTimeout(timeout);}
  app.exit(0);
})().catch(e=>{console.error(e);clearTimeout(timeout);app.exit(1);});
