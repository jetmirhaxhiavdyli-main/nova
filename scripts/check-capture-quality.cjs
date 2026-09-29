// node scripts/check-capture-quality.cjs REAL_CLIP
// Uses actual native frames from a real clip, compares old full-frame cropping
// with native cropping, then compares MP4/WebM Source/High against lossless RGB.
if(!process.versions.electron){
  const child=require('node:child_process').spawn(require('electron'),[__filename,...process.argv.slice(2)],{windowsHide:true,stdio:'inherit',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
  child.on('exit',code=>process.exit(code??1));return;
}
const {app,BrowserWindow,utilityProcess}=require('electron'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');const {run,ffmpeg,RGB_TO_BT709,BT709_TAGS}=require('../electron/export.cjs');
const {createEditorExport}=require('../electron/editorExport.cjs');
app.on('window-all-closed',()=>{}); // Keep the process alive for the offline comparison.
const frames=30,fps=30;let child,window;
const timer=setTimeout(()=>{console.error('Quality check timed out');child?.kill();app.exit(1);},120000);
(async()=>{
  const input=process.argv[2];assert(input,'Supply a real clip');await fs.access(input);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-capture-quality-'));app.setPath('userData',dir);await app.whenReady();
  window=new BrowserWindow({width:1280,height:720,useContentSize:true,frame:false,show:true,webPreferences:{backgroundThrottling:false}});
  const url=pathToFileURL(input).href;
  // A local fixture origin can load the supplied clip without changing browser security.
  const html=path.join(dir,'fixture.html');await fs.writeFile(html,`<title>Nova real-clip quality test</title><body style="margin:0;background:black"><video muted style="width:100vw;height:100vh" src="${url}"></video>`);await window.loadFile(html);
  await window.webContents.executeJavaScript(`(async()=>{const v=document.querySelector('video');if(v.readyState<2)await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});await v.play();})()`,true);
  window.show();await new Promise(r=>setTimeout(r,300));
  child=utilityProcess.fork(path.join(__dirname,'capture-quality-worker.cjs'),[],{stdio:'ignore'});
  await new Promise(r=>child.once('spawn',r));
  let width,height;
  for(let i=0;i<frames;i++){
    const message=new Promise((r,j)=>{child.once('message',m=>m.error?j(Error(m.error)):r(m));});
    child.postMessage(i?{type:'next'}:{type:'start',handle:Number(window.getMediaSourceId().split(':')[1])});
    const m=await message;width=m.width;height=m.height;
    const baseline=Buffer.alloc(width*height*4),full=Buffer.from(m.full);
    for(let y=0;y<height;y++)full.copy(baseline,y*width*4,((m.y+y)*m.sourceWidth+m.x)*4,((m.y+y)*m.sourceWidth+m.x+width)*4);
    assert.deepEqual(Buffer.from(m.pixels),baseline,'Native crop must preserve every source pixel');
    await fs.writeFile(path.join(dir,`${i}.rgba`),baseline);
  }
  child.kill();child=null;window.destroy();window=null;
  // A lossless reference from exactly the sampled RGB pixels, at unchanged dimensions.
  const all=await fs.open(path.join(dir,'reference.rgba'),'w');
  try{for(let i=0;i<frames;i++)await all.write(await fs.readFile(path.join(dir,`${i}.rgba`)));}finally{await all.close();}
  const reference=path.join(dir,'reference.mkv');
  await run(ffmpeg,['-v','error','-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(fps),'-i',path.join(dir,'reference.rgba'),'-vf',RGB_TO_BT709+',format=yuv420p','-c:v','ffv1',...BT709_TAGS,reference]);
  const rows=[];
  for(const format of ['MP4','WebM'])for(const quality of ['source','social']){
    const results=[];
    for(const route of ['baseline','native-crop']){
      const job=await createEditorExport({destination:'file',format,quality,fps,width,height,duration:1,frameFormat:'rgba'},{temp:dir,desktop:dir,signal:new AbortController().signal});
      try{for(let i=0;i<frames;i++)await job.frame(new Uint8Array(await fs.readFile(path.join(dir,`${i}.rgba`))));
        const {filePath}=await job.finish(),scores={};
        for(const metric of ['ssim','psnr']){
          const stats=`${format}-${quality}-${route}-${metric}.txt`;
          // stats path is relative to cwd so Windows drive colons need no filter escaping.
          const statPath=path.join(process.cwd(),stats);
          await run(ffmpeg,['-v','error','-i',filePath,'-i',reference,'-filter_complex',`[0:v]settb=AVTB,setpts=N/(${fps}*TB)[a];[1:v]settb=AVTB,setpts=N/(${fps}*TB)[b];[a][b]${metric}=stats_file=${stats}`,'-f','null','-']);
          const values=[...(await fs.readFile(statPath,'utf8')).matchAll(metric==='ssim'?/All:([\d.]+)/g:/psnr_avg:([\d.]+|inf)/g)].map(m=>m[1]==='inf'?Infinity:Number(m[1]));assert.equal(values.length,frames);
          scores[metric]=values.some(v=>!Number.isFinite(v))?'infinite':values.reduce((a,b)=>a+b,0)/values.length;await fs.unlink(statPath);
        }
        results.push({route,bytes:(await fs.stat(filePath)).size,...scores});
      }finally{await job.dispose();}
    }
    assert.equal(results[0].bytes,results[1].bytes);assert.equal(results[0].ssim,results[1].ssim);assert.equal(results[0].psnr,results[1].psnr);
    rows.push({format,quality,results});
  }
  const report={width,height,frames,rows,limitation:'Native crop pixel parity and export quality on a real clip; does not measure hardware encoder choice or real-time capture frame pacing.'};
  await fs.writeFile(path.join(dir,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,...report,dir}));
  for(let i=0;i<frames;i++)await fs.unlink(path.join(dir,`${i}.rgba`));await fs.unlink(path.join(dir,'reference.rgba'));
  clearTimeout(timer);app.exit(0);
})().catch(e=>{console.error(e);child?.kill();window?.destroy();clearTimeout(timer);app.exit(1);});
