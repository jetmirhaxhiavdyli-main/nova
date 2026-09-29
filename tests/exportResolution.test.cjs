const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {encode,probe,run,ffmpeg,validate}=require('../electron/export.cjs');
const {createEditorExport}=require('../electron/editorExport.cjs');
test('resolution bounds rotate, never upscale and pad MP4 only',async()=>{
 const {outputSize}=await import('../electron/exportGeometry.mjs');
 assert.deepEqual(outputSize({width:1920,height:1080},'480p','GIF'),{width:640,height:360});
 assert.deepEqual(outputSize({width:1080,height:1920},'720p','MP4'),{width:720,height:1280});
 assert.deepEqual(outputSize({width:301,height:201},'1080p','MP4'),{width:302,height:202});
 assert.deepEqual(outputSize({width:301,height:201},'720p','WebM'),{width:301,height:201});
 for(const fps of [10,15,20,30])validate({destination:'file',format:'GIF',fps,quality:'web',resolution:'480p'});
 assert.throws(()=>validate({destination:'file',format:'MP4',fps:15,quality:'web'}));
 assert.throws(()=>validate({destination:'file',format:'MP4',fps:30,quality:'web',resolution:'480p'}));
 assert.throws(()=>validate({destination:'file',format:'GIF',fps:15,quality:'web',resolution:'bogus'}));
});
test('both encoders produce advertised sizes, preserve timing and decode after resizing',async()=>{
 const {outputSize}=await import('../electron/exportGeometry.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'export-resolution-'));
 try {
  for(const size of [{width:1301,height:731},{width:731,height:1301}]){
   const png=path.join(dir,'frame.png'),input=path.join(dir,'input.mkv');
   await run(ffmpeg,['-v','error','-y','-f','lavfi','-i',`testsrc=size=${size.width}x${size.height}:rate=30`,'-frames:v','1',png]);
   await run(ffmpeg,['-v','error','-y','-loop','1','-i',png,'-t','0.4','-r','30','-c:v','ffv1',input]);
   for(const settings of [{format:'MP4',fps:30,resolution:'720p'},{format:'WebM',fps:30,resolution:'720p'},...[10,15,20].map(fps=>({format:'GIF',fps,resolution:'480p'}))]) {
    const options={destination:'file',quality:'web',...settings};
    for(const editor of [false,true]){
     let output=path.join(dir,'out.'+options.format.toLowerCase()),job;
     try {
      if(editor){
       job=await createEditorExport({...options,...size,duration:.4,frameFormat:'png'},{temp:dir,desktop:dir,signal:new AbortController().signal});
       const bytes=new Uint8Array(await fs.readFile(png));
       for(let i=0;i<Math.ceil(.4*options.fps);i++)await job.frame(bytes);
       output=(await job.finish()).filePath;
      }else await encode(input,output,options);
      const info=await probe(output),expected=outputSize(size,options.resolution,options.format);
      assert.equal(info.width,expected.width);assert.equal(info.height,expected.height);
      if(options.format==='GIF'){
       const packets=JSON.parse(await run(require('ffprobe-static').path,['-v','error','-min_delay','0','-show_entries','packet=duration_time','-of','json',output])).packets;
       assert.equal(packets.length,Math.ceil(.4*options.fps));
       assert.ok(Math.abs(packets.reduce((sum,p)=>sum+Number(p.duration_time),0)-.4)<.08);
      }else assert.ok(Math.abs(info.duration-.4)<.06);
      await run(ffmpeg,['-v','error','-i',output,'-f','null','-']);
     }finally{await job?.dispose();}
    }
   }
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
