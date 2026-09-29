const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { encode, probe, validate, run, ffmpeg, PRESETS } = require('../electron/export.cjs');

test('rejects unsupported settings and link exports', () => {
  assert.throws(()=>validate({destination:'link',format:'MP4',fps:60,quality:'source'}));
  assert.throws(()=>validate({destination:'file',format:'MP4',fps:99,quality:'source'}));
});
test('real encodes preserve dimensions and apply formats, all frame rates and quality presets', { timeout: 180000 }, async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(),'showcase-encoder-test-'));
  try {
    const input=path.join(folder,'input.webm');
    await run(ffmpeg,['-y','-f','lavfi','-i','testsrc2=size=160x90:rate=60','-t','1','-c:v','libvpx-vp9','-lossless','1',input]);
    for(const format of ['MP4','WebM','GIF']) {
      const sizes={};
      for(const fps of [24,30,50,60]) for(const quality of Object.keys(PRESETS)) {
        const output=path.join(folder,`${format}-${fps}-${quality}.${format.toLowerCase()}`);
        await encode(input,output,{destination:'file',format,fps,quality});
        const info=await probe(output);
        assert.equal(info.width,160);assert.equal(info.height,90);
        assert.equal(info.codec_name,{MP4:'h264',WebM:'vp9',GIF:'gif'}[format]);
        if(format==='MP4') {assert.equal(info.pix_fmt,'yuv420p');assert.equal(info.profile,'High');}
        if(format!=='GIF') {const [n,d]=info.r_frame_rate.split('/').map(Number);assert.equal(n/d,fps);}
        let duration = info.duration;
        if (format === 'GIF') {
          const packets = JSON.parse(await run(require('ffprobe-static').path, ['-v','error','-min_delay','0','-show_entries','packet=duration_time','-of','json',output])).packets;
          assert.equal(packets.length,fps);
          duration = packets.reduce((sum,p)=>sum+Number(p.duration_time),0);
        }
        assert(Math.abs(duration-1)<.15, JSON.stringify({format,fps,quality,duration}));
        sizes[`${fps}-${quality}`]=(await fs.stat(output)).size;
      }
      assert(sizes['60-source']>sizes['60-web-low']);
      console.log(format,'all FPS/quality combinations passed');
    }
    const odd=path.join(folder,'odd.webm');
    await run(ffmpeg,['-y','-f','lavfi','-i','testsrc=size=161x91:rate=30','-t','0.3','-c:v','libvpx-vp9',odd]);
    const output=path.join(folder,'odd.mp4');
    await encode(odd,output,{destination:'file',format:'MP4',fps:30,quality:'source'});
    const info=await probe(output);assert.equal(info.width,162);assert.equal(info.height,92);
    assert.equal(info.pix_fmt,'yuv420p');assert.equal(info.profile,'High');
    await run(ffmpeg,['-v','error','-i',output,'-f','null','-']);
    const controller=new AbortController();
    const job=encode(input,path.join(folder,'cancel.mp4'),{destination:'file',format:'MP4',fps:60,quality:'source'},{signal:controller.signal});
    controller.abort();await assert.rejects(job,/cancelled/);
    assert((await fs.stat(input)).size>0);
  } finally { await fs.rm(folder,{recursive:true,force:true}); }
});


