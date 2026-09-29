const path = require('node:path');
// The watchdog runs outside native capture, so a blocked driver cannot block it.
function createNativeCapture({desktopCapturer, screen, utilityProcess, MessageChannelMain, deliverPort, log=()=>{}, timeoutMs=18000}) {
  let current=null, serial=0;
  function stop(id) {
    const state=current;
    if(!state || (id!==undefined && state.id!==id))return Promise.resolve();
    current=null;clearTimeout(state.timer);
    state.reject?.(Error('Capture was stopped.'));state.reject=null;
    state.child?.kill();return Promise.resolve();
  }
  function start(sourceId,fps,token,selection=null) {
    void stop();
    const state={id:++serial};current=state;
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
        child.once('spawn',()=>{if(cancelled()){child.kill();return;}child.postMessage({type:'start',sourceId,fps,display,primaryId:screen.getPrimaryDisplay().id,selection});});
        child.on('message',message=>{
          if(cancelled())return;
          if(message.error){fail(Error(message.error));return;}
          if(message.type==='ready'){
            if(state.ready)return;
            try{
              const {port1,port2}=new MessageChannelMain();
              child.postMessage({type:'port'},[port1]);deliverPort({token,id:state.id},port2);
              clearTimeout(state.timer);state.reject=null;state.ready=true;
              log({event:'native-ready',...message.info});resolve({id:state.id,...message.info});
            }catch(error){fail(error);}
          }
        });
      })().catch(fail);
    });
  }
  return {start,stop};
}
module.exports={createNativeCapture};
