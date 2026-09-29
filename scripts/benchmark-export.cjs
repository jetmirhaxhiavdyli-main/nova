// node scripts/benchmark-export.cjs INPUT OUTPUT_DIRECTORY [seconds=4] [fps=30]
// Use separate output directories to compare revisions. Input may already be
// compressed: scores measure additional loss, not original capture fidelity.
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {encode,probe,ffmpeg,PRESETS}=require('../electron/export.cjs');
function run(args){return new Promise((resolve,reject)=>{
  let log='';const child=spawn(ffmpeg,args,{windowsHide:true});
  child.stderr.on('data',d=>{log=(log+d).slice(-20000);});
  child.on('error',reject);child.on('close',code=>code?reject(Error(log)):resolve(log));
});}
async function main(){
  const [input,folder,seconds='4',rate='30']=process.argv.slice(2);
  const duration=Number(seconds),fps=Number(rate);
  if(!input||!folder||!Number.isFinite(duration)||duration<=0||![24,30,50,60].includes(fps))
    throw Error('Usage: node scripts/benchmark-export.cjs INPUT NEW_OUTPUT_DIRECTORY [seconds] [24|30|50|60]');
  await fs.mkdir(folder); // Refuse to overwrite another benchmark.
  const source=await probe(input),reference=path.join(folder,'reference.mkv');
  await run(['-v','error','-i',input,'-t',String(duration),'-vf',`fps=${fps},pad=ceil(iw/2)*2:ceil(ih/2)*2`,'-an','-c:v','ffv1',reference]);
  const report={input:path.resolve(input),source,reference:await probe(reference),fps,created:new Date().toISOString(),rows:[],
    limitations:'Finished-modal encoder benchmark; excludes capture/compositor time and audio. Loss is relative to supplied input. GIF temporal scores excluded because delays are quantized.'};
  for(const format of ['MP4','WebM','GIF'])for(const quality of Object.keys(PRESETS)){
    const output=path.join(folder,`${format}-${quality}.${format.toLowerCase()}`),start=performance.now();
    await encode(reference,output,{destination:'file',format,fps,quality});
    const row={format,quality,bytes:(await fs.stat(output)).size,encodeSeconds:(performance.now()-start)/1000,metadata:await probe(output)};
    await run(['-v','error','-i',output,'-f','null','-']);
    if(format!=='GIF')for(const metric of ['ssim','psnr']){
      const log=await run(['-i',output,'-i',reference,'-filter_complex',`[0:v]settb=AVTB,setpts=N/(${fps}*TB),format=yuv420p[a];[1:v]settb=AVTB,setpts=N/(${fps}*TB),format=yuv420p[b];[a][b]${metric}`,'-an','-f','null','-']);
      const match=log.match(metric==='ssim'?/All:([\d.]+)/:/average:([\d.]+|inf)/);
      if(!match)throw Error('Missing '+metric+' metric');
      row[metric]=match[1]==='inf'?'infinite':Number(match[1]);
    }
    report.rows.push(row);
    await fs.writeFile(path.join(folder,'results.json'),JSON.stringify(report,null,2));
    console.log(`${format} ${quality}: ${(row.bytes/1e6).toFixed(2)} MB, ${row.encodeSeconds.toFixed(2)}s, SSIM ${row.ssim??'n/a'}`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
