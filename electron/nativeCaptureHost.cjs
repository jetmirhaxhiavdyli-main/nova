const path = require('node:path');
// The watchdog runs outside native capture, so a blocked driver cannot block it.
function createNativeCapture({desktopCapturer, screen, utilityProcess, MessageChannelMain, deliverPort, log=()=>{}, timeoutMs=18000, ffmpeg, tempDir}) {
  let current=null, serial=0;
  function stop(id) {
    const state=current;
    if(!state || (id!==undefined && state.id!==id))return Promise.resolve();
    current=null;clearTimeout(state.timer);
    state.reject?.(Error('Capture was stopped.'));state.reject=null;
    for(const p of state.acks?.values()||[])p.reject(Error('Capture was stopped.'));
    state.child?.kill();
    if(state.file)setTimeout(()=>require('node:fs').rm(state.file,{force:true},()=>{}),3000); // the encoder may still hold it briefly
    return Promise.resolve();
  }
  // Recording mode: ask the worker to go/pause/resume/finish. It answers once the command has taken effect.
  function command(id,type,timeout=15000) {
    const state=current;
    if(!state?.ready||state.id!==id||!state.file)return Promise.reject(Error('Capture is not running.'));
    return new Promise((resolve,reject)=>{
      const request=++state.requests,timer=setTimeout(()=>{state.acks.delete(request);reject(Error('Screen capture stopped responding.'));},timeout);
      state.acks.set(request,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});
      state.child.postMessage({type:'rec',command:type,request});
    });
  }
  /** Finishes the file and returns its path; the caller reads it and calls `discard`. */
  async function finish(id) {
    await command(id,'finish',60000);
    const state=current;current=null;state.child.kill();return state.file;
  }
  function start(sourceId,fps,token,selection=null,record=false) {
    void stop();
    const state={id:++serial,acks:new Map(),requests:0,file:record?path.join(tempDir,`nova-recording-${Date.now()}-${serial}.mkv`):null};current=state;
    const cancelled=()=>current!==state;
    return new Promise((resolve,reject)=>{
      const fail=error=>{if(cancelled())return;reject(error);state.reject=null;void stop(state.id);};
      state.reject=reject;
      state.timer=setTimeout(()=>fail(Error('Smooth cursor capture timed out.')),timeoutMs);
      (async()=>{
        const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0}});
        if(cancelled())return;
        const source=sources.find(s=>s.id===sourceId);
        if(!source)throw Error('The selected recording source is unavailable.');
        const display=require('./displayMatch.cjs').displayForSource(screen.getAllDisplays(),source,sources);
        const child=state.child=utilityProcess.fork(path.join(__dirname,'captureWorker.cjs'),[],{serviceName:'Nova Capture',stdio:'ignore'});
        child.once('error',fail);
        child.once('exit',code=>{if(!cancelled())fail(Error(`Screen capture stopped (${code}).`));});
        child.once('spawn',()=>{if(cancelled()){child.kill();return;}child.postMessage({type:'start',sourceId,fps,display,primaryId:screen.getPrimaryDisplay().id,selection,record:state.file?{ffmpeg,file:state.file}:null});});
        child.on('message',message=>{
          if(cancelled())return;
          if(message.type==='ack'){const p=state.acks.get(message.request);state.acks.delete(message.request);if(p)message.error?p.reject(Error(message.error)):p.resolve();return;}
          if(message.error){fail(Error(message.error));return;}
          if(message.type==='ready'){
            if(state.ready)return;
            try{
              if(!state.file){const {port1,port2}=new MessageChannelMain();
              child.postMessage({type:'port'},[port1]);deliverPort({token,id:state.id},port2);}
              clearTimeout(state.timer);state.reject=null;state.ready=true;
              log({event:'native-ready',...message.info});resolve({id:state.id,...message.info});
            }catch(error){fail(error);}
          }
        });
      })().catch(fail);
    });
  }
  return {start,stop,command,finish};
}
module.exports={createNativeCapture};
