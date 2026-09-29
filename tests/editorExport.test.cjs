const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createEditorExport}=require('../electron/editorExport.cjs');
const {run,ffmpeg,probe}=require('../electron/export.cjs');
test('microphone audio trims to the new edges, mixes clicks and stays silent in GIF',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'camera-mic-export-'));
 try{
  const audio=path.join(dir,'voice.webm'),png=path.join(dir,'frame.png');
  await run(ffmpeg,['-v','error','-f','lavfi','-i',"aevalsrc=if(between(t\\,1.2\\,1.6)\\,0.3*sin(2*PI*440*t)\\,0):s=48000:d=3",'-c:a','libopus',audio]);
  await run(ffmpeg,['-v','error','-f','lavfi','-i','color=blue:size=64x48','-frames:v','1',png]);
  const audioSource=new Uint8Array(await fs.readFile(audio)),frame=new Uint8Array(await fs.readFile(png));
  for(const format of ['MP4','WebM','GIF']){
   const job=await createEditorExport({destination:'file',format,fps:24,quality:'source',width:64,height:48,duration:1,audioSource,audioStart:1,audioVolume:.5,clicks:[.8]}, {temp:dir,desktop:dir,signal:new AbortController().signal});
   try{
    for(let i=0;i<24;i++)await job.frame(frame);
    const {filePath}=await job.finish();
    const info=JSON.parse(await run(require('ffprobe-static').path,['-v','error','-show_streams','-of','json',filePath]));
    assert.equal(info.streams.some(s=>s.codec_type==='audio'),format!=='GIF');
    if(format==='GIF')continue;
    const pcm=path.join(dir,format+'.pcm');await run(ffmpeg,['-v','error','-i',filePath,'-vn','-ar','48000','-ac','1','-f','s16le',pcm]);
    const samples=await fs.readFile(pcm),energy=(a,b)=>{let sum=0;for(let i=Math.floor(a*48000);i<Math.floor(b*48000);i++)sum+=Math.abs(samples.readInt16LE(i*2));return sum;};
    assert(energy(.25,.5)>energy(0,.15)*10+1000,'voice rebased by trim.start');
    assert(energy(.8,.87)>energy(.65,.72)*5+1000,'click mixed with voice');
    assert(Math.abs((await probe(filePath)).duration-1)<.08);
   }finally{await job.dispose();}
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('deleted sections: the voice is cut to the kept ranges and muted over audio-only deletions',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cut-export-'));
 try{
  // Tone only at 1.2–1.6 s of a 3 s source. Keep 0–0.5 and 1.2–1.7 → the tone lands at 0.5–0.9 s of a 1 s output.
  const audio=path.join(dir,'voice.webm'),png=path.join(dir,'frame.png');
  await run(ffmpeg,['-v','error','-f','lavfi','-i',"aevalsrc=if(between(t\\,1.2\\,1.6)\\,0.3*sin(2*PI*440*t)\\,0):s=48000:d=3",'-c:a','libopus',audio]);
  await run(ffmpeg,['-v','error','-f','lavfi','-i','color=blue:size=64x48','-frames:v','1',png]);
  const job=await createEditorExport({destination:'file',format:'MP4',fps:24,quality:'source',width:64,height:48,duration:1,
   audioSource:new Uint8Array(await fs.readFile(audio)),audioStart:0,audioVolume:1,audioSegments:[{start:0,end:.5},{start:1.2,end:1.7}],audioMutes:[{start:.75,end:.85}]},
   {temp:dir,desktop:dir,signal:new AbortController().signal});
  try{
   const frame=new Uint8Array(await fs.readFile(png));for(let i=0;i<24;i++)await job.frame(frame);
   const {filePath}=await job.finish();
   const pcm=path.join(dir,'out.pcm');await run(ffmpeg,['-v','error','-i',filePath,'-vn','-ar','48000','-ac','1','-f','s16le',pcm]);
   const samples=await fs.readFile(pcm),energy=(a,b)=>{let sum=0;for(let i=Math.floor(a*48000);i<Math.floor(b*48000);i++)sum+=Math.abs(samples.readInt16LE(i*2));return sum;};
   assert(energy(.55,.7)>energy(.1,.4)*10+1000,'tone moved to right after the cut');
   assert(energy(.55,.7)>energy(.77,.83)*10+1000,'audio-only deletion is muted');
   assert(Math.abs((await probe(filePath)).duration-1)<.08);
  }finally{await job.dispose();}
  await assert.rejects(createEditorExport({destination:'file',format:'MP4',fps:24,quality:'source',width:64,height:48,duration:1,audioMutes:[{start:.5,end:5}]},{temp:dir,desktop:dir,signal:new AbortController().signal}),/Invalid audio sections/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
// MP4/WebM encode directly with BT.709 conversion (the FFV1 intermediate is GIF-only), so parity is PNG vs raw frames there.
test('raw and PNG frames export identically (and match the lossless-intermediate path for GIF)',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'export-parity-'));
 try {
  const png=path.join(dir,'source.png'),rgba=path.join(dir,'source.rgba');
  await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc=size=65x49','-frames:v','1',png]);
  await run(ffmpeg,['-v','error','-i',png,'-pix_fmt','rgba','-f','rawvideo',rgba]);
  const images={png:new Uint8Array(await fs.readFile(png)),rgba:new Uint8Array(await fs.readFile(rgba))};
  for(const format of ['MP4','WebM','GIF']) {
   let baseline;
   for(const mode of [...(format==='GIF'?[{directEncode:false,frameFormat:'png'}]:[]),{directEncode:true,frameFormat:'png'},{directEncode:true,frameFormat:'rgba'}]) {
    const job=await createEditorExport({destination:'file',format,fps:30,quality:'source',width:65,height:49,duration:.3,...mode},{temp:dir,desktop:dir,signal:new AbortController().signal,onProgress:()=>{}});
    try {
     await assert.rejects(job.frame(new Uint8Array(4)));
     for(let i=0;i<9;i++)await job.frame(images[mode.frameFormat]);
     const {filePath}=await job.finish();
     const hashes=(await run(ffmpeg,['-v','error','-i',filePath,'-f','framemd5','-'])).split('\n').filter(s=>s&&!s.startsWith('#')).map(s=>s.split(',').at(-1).trim());
     if(!baseline)baseline=hashes;else assert.deepEqual(hashes,baseline,format+' pixel parity');
    }finally{await job.dispose();}
   }
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('trimmed export has kept duration, rebased click audio and even MP4 dimensions',async()=>{
 const {prepareTrimmedExport}=await import('../src/trimExport.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'trimmed-export-test-'));
 try {
  const png=path.join(dir,'odd.png');await run(ffmpeg,['-v','error','-f','lavfi','-i','testsrc=size=65x49','-frames:v','1',png]);
  const {recording,edits}=prepareTrimmedExport({events:[],clicks:[.2,1.25,2.5]}, {duration:4,trim:{start:1,end:2},zooms:[],splits:[]});
  assert.deepEqual(recording.clicks,[.25]);
  const job=await createEditorExport({destination:'file',format:'MP4',fps:24,quality:'source',width:65,height:49,duration:edits.duration,clicks:recording.clicks},{temp:dir,desktop:dir,signal:new AbortController().signal,onProgress:()=>{}});
  try {
   const bytes=new Uint8Array(await fs.readFile(png));for(let i=0;i<24;i++)await job.frame(bytes);
   const {filePath}=await job.finish(),info=await probe(filePath);
   assert.equal(info.width,66);assert.equal(info.height,50);assert.ok(Math.abs(info.duration-1)<.05);
   const pcm=path.join(dir,'decoded.pcm');await run(ffmpeg,['-v','error','-i',filePath,'-vn','-ar','48000','-ac','1','-f','s16le',pcm]);
   const samples=await fs.readFile(pcm);const energy=(start,end)=>{let sum=0;for(let i=Math.floor(start*48000);i<Math.floor(end*48000);i++)sum+=Math.abs(samples.readInt16LE(i*2));return sum;};
   assert(energy(.24,.32)>energy(0,.15)*10+1000,'click occurs at .25 seconds in output, not its original time');
  }finally{await job.dispose();}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('composition stream exports all formats and removes intermediates; cancellation publishes nothing',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'editor-export-test-'));
  try {
    const png=path.join(dir,'frame.png');
    await run(ffmpeg,['-v','error','-f','lavfi','-i','color=red:size=64x48','-frames:v','1',png]);
    const blue=path.join(dir,'blue.png');
    await run(ffmpeg,['-v','error','-f','lavfi','-i','color=blue:size=64x48','-frames:v','1',blue]);
    const blueBytes=new Uint8Array(await fs.readFile(blue));
    const bytes=new Uint8Array(await fs.readFile(png));
    for(const format of ['MP4','WebM','GIF']) {
      const signal=new AbortController().signal;
      const job=await createEditorExport({destination:'file',format,fps:24,quality:'source',width:64,height:48,duration:1/3,clicks:[.1]}, {temp:dir,desktop:dir,signal,onProgress:()=>{}});
      try {
        for(let i=0;i<8;i++)await job.frame(i%2?blueBytes:bytes);
        const {filePath}=await job.finish(),meta=await probe(filePath);
        assert.equal(meta.width,64);assert.equal(meta.height,48);let duration=meta.duration;
        if(format==='GIF') {const packets=JSON.parse(await run(require('ffprobe-static').path,['-v','error','-min_delay','0','-show_entries','packet=duration_time','-of','json',filePath])).packets;assert.equal(packets.length,8);duration=packets.reduce((sum,p)=>sum+Number(p.duration_time),0);}
        assert.ok(Math.abs(duration-1/3)<.06);
        if(format==='MP4')assert.equal(meta.pix_fmt,'yuv420p');
        if(format!=='GIF') {assert.equal(meta.color_space,'bt709');assert.equal(meta.color_primaries,'bt709');assert.equal(meta.color_transfer,'bt709');}
        const streams=JSON.parse(await run(require('ffprobe-static').path,['-v','error','-show_streams','-of','json',filePath])).streams;
        assert.equal(streams.some(s=>s.codec_type==='audio'),format!=='GIF');
      } finally {await job.dispose();}
    }
    const controller=new AbortController();
    const job=await createEditorExport({destination:'file',format:'MP4',fps:30,quality:'web',width:64,height:48,duration:1}, {temp:dir,desktop:dir,signal:controller.signal,onProgress:()=>{}});
    await job.frame(bytes);controller.abort();await assert.rejects(job.frame(bytes));await job.dispose();
    const files=await fs.readdir(dir);assert.equal(files.filter(f=>f.startsWith('Nova-')).length,3);assert.equal(files.some(f=>f.startsWith('showcase-editor-')||f.startsWith('.showcase')),false);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

