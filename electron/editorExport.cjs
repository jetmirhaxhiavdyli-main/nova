const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {ffmpeg, encode, validate, run, codecArgs, RGB_TO_BT709, BT709_TAGS} = require('./export.cjs');

// A bounded frame stream: acknowledge each frame only after the encoder accepts it.
async function createEditorExport(options, {temp, desktop, target, signal, onProgress}) {
  validate(options);
  const {width,height,duration,fps} = options;
  const raw=options.frameFormat==='rgba';
  if(options.frameFormat!==undefined && !['png','rgba'].includes(options.frameFormat))throw Error('Invalid frame format.');
  if (![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=8192) || !Number.isFinite(duration) || duration<=0 || duration>86400) throw Error('Invalid composition dimensions or duration.');
  if(options.clicks !== undefined && (!Array.isArray(options.clicks) || options.clicks.length>1000000 || options.clicks.some(t=>!Number.isFinite(t)||t<0||t>=duration))) throw Error('Invalid click track.');
  if(options.audioSource!==undefined&&(!(options.audioSource instanceof Uint8Array)||!options.audioSource.length||options.audioSource.length>1024*1024*1024))throw Error('Invalid microphone source.');
  if(options.audioSource&&(!Number.isFinite(options.audioStart)||options.audioStart<0||!Number.isFinite(options.audioVolume)||options.audioVolume<0||options.audioVolume>2))throw Error('Invalid microphone settings.');
  // Deleted sections: the voice is cut to the same kept source ranges as the video, and muted over audio-only deletions (output seconds).
  const ranges=(list,max)=>list===undefined||(Array.isArray(list)&&list.length<=10000&&list.every(r=>r&&Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.start>=0&&r.end>r.start&&(max===undefined||r.end<=max+1e-3)));
  if(!ranges(options.audioSegments)||!ranges(options.audioMutes,duration))throw Error('Invalid audio sections.');
  const folder=await fs.mkdtemp(path.join(temp,'showcase-editor-'));
  // Direct encoding gives byte-identical output to the old FFV1 intermediate, faster.
  const direct=options.format!=='GIF' && options.directEncode!==false;
  const input=path.join(folder,direct?`frames.${options.format.toLowerCase()}`:'frames.mkv');
  const frameInput=raw?['-f','rawvideo','-pixel_format','rgba','-video_size',`${width}x${height}`,'-framerate',String(fps)]:['-f','image2pipe','-framerate',String(fps)];
  const {resolutionFilters}=await import('./exportGeometry.mjs');
  const geometry=resolutionFilters({width,height},options);
  const filters=[...geometry.filters,RGB_TO_BT709].join(',');
  const encoding=direct?['-vf',filters,...codecArgs(options,geometry.output.width,geometry.output.height),...BT709_TAGS,'-an']:['-an','-c:v','ffv1','-pix_fmt','bgra'];
  const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y',...frameInput,'-i','pipe:0',...encoding,input],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let stderr='',failure=null,count=0,closed=false,staged;
  child.stderr.on('data',d=>stderr=(stderr+d).slice(-6000));
  child.stdin.on('error',e=>{failure=e;});
  const done=new Promise((resolve,reject)=>{
    child.on('error',e=>{failure=e;closed=true;reject(e);});
    child.on('close',code=>{closed=true;code===0&&!signal.aborted?resolve():reject(failure || Error(signal.aborted?'Export cancelled.':stderr||'Frame encoding failed.'));});
  });
  done.catch(()=>{});
  const abort=()=>child.kill();signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted) abort();
  return {
    async frame(bytes) {
      if(signal.aborted || failure || closed) throw failure || Error('Export cancelled or encoder stopped.');
      if (!(bytes instanceof Uint8Array) || bytes.length<4 || bytes.length>256*1024*1024) throw Error('Invalid frame.');
      const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      const valid=raw?b.length===width*height*4:b.length>=24&&b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&b.readUInt32BE(16)===width&&b.readUInt32BE(20)===height;
      if(!valid || count>=Math.ceil(duration*fps)) throw Error('Unexpected composition frame.');
      await new Promise((resolve,reject)=>child.stdin.write(b,e=>e?reject(e):resolve())); count++;
    },
    async finish() {
      if(count!==Math.ceil(duration*fps)) throw Error('The composition is incomplete.');
      child.stdin.end();await done;
      let source=input;
      const clicks=options.clicks || [];
      if(options.format!=='GIF' && clicks.length) {
        // Same short triangle tick as the editor preview, synthesized offline.
        const rate=48000, length=Math.ceil(duration*rate), header=Buffer.alloc(44);
        if(length*2>0xffffffff-36) throw Error('Recording is too long for the click audio track.');
        header.write('RIFF');header.writeUInt32LE(36+length*2,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(length*2,40);
        const audio=path.join(folder,'clicks.wav'),handle=await fs.open(audio,'w+');
        try {
          await handle.write(header,0,44,0);await handle.truncate(44+length*2);
          for(const t of clicks) {
            if(signal.aborted) throw Error('Export cancelled.');
            const start=Math.floor(t*rate),count=Math.min(Math.ceil(rate*.06),length-start),block=Buffer.alloc(count*2);
            await handle.read(block,0,block.length,44+start*2);
            for(let i=0;i<count;i++) {
              const wave=2/Math.PI*Math.asin(Math.sin(2*Math.PI*1900*i/rate));
              const value=block.readInt16LE(i*2)+32767*.12*Math.exp(-Math.log(120)*i/(rate*.05))*wave;
              block.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(value))),i*2);
            }
            await handle.write(block,0,block.length,44+start*2);
          }
        } finally {await handle.close();}
        source=path.join(folder,direct?`with-audio.${options.format.toLowerCase()}`:'with-audio.mkv');
        const audioArgs=direct?(options.format==='MP4'?['-c:a','aac','-b:a','192k','-movflags','+faststart']:['-c:a','libopus','-b:a','128k']):['-c:a','pcm_s16le'];
        await run(ffmpeg,['-v','error','-y','-i',input,'-i',audio,'-map','0:v','-map','1:a','-c:v','copy',...audioArgs,'-t',String(duration),source],{signal});
      }
      if(options.audioSource&&options.format!=='GIF'){
        const original=path.join(folder,'microphone-source.webm');await fs.writeFile(original,options.audioSource);
        const mixed=path.join(folder,direct?`with-mic.${options.format.toLowerCase()}`:'with-mic.mkv');
        const segments=options.audioSegments?.length?options.audioSegments:[{start:options.audioStart,end:options.audioStart+duration}];
        const mutes=(options.audioMutes||[]).map(m=>`,volume=enable='between(t,${m.start},${m.end})':volume=0`).join('');
        const tail=`volume=${options.audioVolume}${mutes},apad,atrim=duration=${duration}[voice]`;
        const voice=segments.length===1
          ?`[1:a:0]atrim=start=${segments[0].start}:end=${segments[0].end},asetpts=PTS-STARTPTS,${tail}`
          :`[1:a:0]asplit=${segments.length}${segments.map((_,i)=>`[in${i}]`).join('')};`+
            segments.map((s,i)=>`[in${i}]atrim=start=${s.start}:end=${s.end},asetpts=PTS-STARTPTS[seg${i}]`).join(';')+
            `;${segments.map((_,i)=>`[seg${i}]`).join('')}concat=n=${segments.length}:v=0:a=1,${tail}`;
        const filter=clicks.length?`${voice};[0:a:0][voice]amix=inputs=2:normalize=0:duration=longest[mix]`:voice;
        const audioArgs=direct?(options.format==='MP4'?['-c:a','aac','-b:a','192k','-movflags','+faststart']:['-c:a','libopus','-b:a','128k']):['-c:a','pcm_s16le'];
        await run(ffmpeg,['-v','error','-y','-i',source,'-i',original,'-filter_complex',filter,'-map','0:v:0','-map',clicks.length?'[mix]':'[voice]','-c:v','copy',...audioArgs,'-t',String(duration),mixed],{signal});
        source=mixed;
      }
      const output=direct?source:path.join(folder,`output.${options.format.toLowerCase()}`);
      if(!direct)await encode(source,output,options,{signal,onProgress,durationHint:duration});
      else onProgress?.(100);
      if(signal.aborted) throw Error('Export cancelled.');
      const filePath=target||path.join(desktop,`Nova-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.${options.format.toLowerCase()}`);
      staged=path.join(path.dirname(filePath),`.showcase-${randomUUID()}.${options.format.toLowerCase()}`);
      await fs.copyFile(output,staged);
      if(signal.aborted) throw Error('Export cancelled.');
      await fs.rename(staged,filePath);staged=null;return {filePath};
    },
    async dispose() {
      signal.removeEventListener('abort',abort);
      if(!closed) child.kill(); await done.catch(()=>{});
      if(staged) await fs.rm(staged,{force:true}).catch(()=>{});
      await fs.rm(folder,{recursive:true,force:true});
    },
  };
}
module.exports={createEditorExport};
