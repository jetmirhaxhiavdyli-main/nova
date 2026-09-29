// Actual Chromium CSS/canvas parity and MP4/WebM/GIF regression; no device access.
if(!process.versions.electron){
  const child=require('node:child_process').spawn(require('electron'),[__filename],{windowsHide:true,stdio:'inherit',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
  child.on('exit',code=>process.exit(code??1));return;
}
const {app,BrowserWindow}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createEditorExport}=require('../electron/editorExport.cjs'),{probe,run,ffmpeg}=require('../electron/export.cjs');
app.on('window-all-closed',()=>{});let window;
const timeout=setTimeout(()=>app.exit(1),90000);
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-animated-check-'));app.setPath('userData',dir);await app.whenReady();
  window=new BrowserWindow({width:640,height:480,show:true,webPreferences:{backgroundThrottling:false}});
  await window.loadFile(path.join(__dirname,'../dist/index.html'));
  const js=code=>window.webContents.executeJavaScript(code,true);
  const presets=await js(`import('../src/components/editor/constants.js').then(m=>m.ANIMATED_BACKGROUNDS)`);
  assert(presets.length>0,'No animated presets found');
  const results=[];
  for(const preset of presets){
  assert(Number.isFinite(preset.seconds)&&preset.seconds>0,preset.id+' needs a positive duration');
  await js(`(async()=>{
    window.fixture?.animation.cancel();window.fixture?.css.remove();
    const preset=${JSON.stringify(preset)};
    const {createCompositionPainter}=await import('../src/editorExport.mjs');
    const {animatedBackground,animatedCss}=await import('../src/components/editor/constants.js');
    const source=document.createElement('canvas');source.width=321;source.height=181;source.getContext('2d').fillStyle='#808080';source.getContext('2d').fillRect(0,0,321,181);
    const edits={duration:preset.seconds*3,output:{size:'original'},background:{mode:'preset',kind:'animated',preset:preset.id,padding:20},video:{roundness:0,shadow:0},cursor:{hidden:true},zooms:[],audio:{music:'none'},splits:[]};
    const canvas=document.createElement('canvas'),recording={events:[],clicks:[]};
    const paint=createCompositionPainter(canvas,source,recording,edits);
    const css=document.createElement('div');Object.assign(css.style,{position:'fixed',left:0,top:0,width:'321px',height:'181px',zIndex:2147483647,backgroundImage:animatedCss(animatedBackground(preset.id)),backgroundSize:'300% 300%'});document.body.appendChild(css);
    const animation=css.animate([{backgroundPosition:'0% 50%'},{backgroundPosition:'100% 50%'}],{duration:preset.seconds*1000,easing:'ease-in-out',iterations:Infinity,direction:'alternate'});animation.pause();
    window.fixture={canvas,paint,animation,css,source,edits,recording,createCompositionPainter};
  })()`);
  const samples=[];let maxChannelDifference=0;
  for(const time of [0,.25,.5,1,1.5,2].map(phase=>phase*preset.seconds)){
    const colors=await js(`(()=>{const f=window.fixture;f.animation.currentTime=${time*1000};f.paint(${time});return [Array.from(f.canvas.getContext('2d').getImageData(10,10,1,1).data),Array.from(f.canvas.getContext('2d').getImageData(310,170,1,1).data)];})()`);
    await new Promise(r=>setTimeout(r,60));const shot=await window.webContents.capturePage({x:0,y:0,width:321,height:181}),size=shot.getSize(),bitmap=shot.toBitmap();
    for(const [i,[x,y]] of [[10,10],[310,170]].entries()){
      const offset=(Math.floor(y*size.height/181)*size.width+Math.floor(x*size.width/321))*4;
      const actual=[bitmap[offset+2],bitmap[offset+1],bitmap[offset]];
      for(let c=0;c<3;c++)maxChannelDifference=Math.max(maxChannelDifference,Math.abs(actual[c]-colors[i][c]));
    }
    samples.push(colors);
  }
  assert(maxChannelDifference<=3,`${preset.id}: CSS/canvas difference ${maxChannelDifference}`);assert.notDeepEqual(samples[0],samples[2],preset.id+' moves');assert.deepEqual(samples[0],samples[5],preset.id+' loops');
  // Trimmed time zero must equal the editor halfway through this preset's forward leg.
  const trimStart=preset.seconds/2;
  assert(await js(`(()=>{const f=window.fixture,c=document.createElement('canvas');const p=f.createCompositionPainter(c,f.source,{...f.recording,motionSource:{offset:${trimStart},events:[],edits:f.edits}},f.edits);p(0);f.paint(${trimStart});return c.toDataURL()===f.canvas.toDataURL();})()`),preset.id+' trim phase');
  const frames=[];
  // Condense a half-leg into a one-second codec fixture; sample timing follows the preset.
  for(let i=0;i<24;i++)frames.push(Buffer.from(await js(`(()=>{fixture.paint(${i/24*preset.seconds/2});return fixture.canvas.toDataURL('image/png').split(',')[1];})()`),'base64'));
  const outputs=[];
  for(const format of ['MP4','WebM','GIF']){
    const job=await createEditorExport({destination:'file',format,fps:24,quality:'source',width:321,height:181,duration:1,frameFormat:'png'},{temp:dir,desktop:dir,signal:new AbortController().signal});
    try{
      for(const frame of frames)await job.frame(new Uint8Array(frame));const {filePath}=await job.finish();const info=await probe(filePath);
      if(format==='GIF'&&!Number.isFinite(info.duration)){
        const packets=JSON.parse(await run(require('ffprobe-static').path,['-v','error','-min_delay','0','-show_packets','-of','json',filePath])).packets;
        info.duration=packets.reduce((sum,p)=>sum+Number(p.duration_time||0),0);
      }
      assert.equal(info.width,format==='MP4'?322:321);assert.equal(info.height,format==='MP4'?182:181);assert(Math.abs(info.duration-1)<.06,format+' duration '+info.duration);
      const hashes=(await run(ffmpeg,['-v','error','-i',filePath,'-vf','crop=32:32:0:0','-f','framemd5','-'])).split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
      assert(new Set(hashes).size>10,preset.id+' '+format+' background must move');outputs.push({format,width:info.width,height:info.height,duration:info.duration});
    }finally{await job.dispose();}
  }
  results.push({preset:preset.id,seconds:preset.seconds,maxChannelDifference,outputs});
  console.log(JSON.stringify(results.at(-1)));
  }
  console.log(JSON.stringify({ok:true,presets:results.length,exports:results.reduce((n,r)=>n+r.outputs.length,0)}));window.destroy();clearTimeout(timeout);app.exit(0);
})().catch(e=>{console.error(e);window?.destroy();clearTimeout(timeout);app.exit(1);});
