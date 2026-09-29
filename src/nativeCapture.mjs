import {captureDeadline} from './captureDeadline.mjs';
export async function createNativeCapture(bridge, sourceId, onEnded, fps=30, selection=null) {
  const token=crypto.randomUUID();let port,session,stream,listener,heartbeat,disposed=false,paused=false,wake;
  let serial=0,frames=0,bytes=0,paintMs=0;const pending=new Map(),began=performance.now();
  const incoming=new Promise(resolve=>{
    listener=e=>{if(e.source===window&&e.data?.type==='showcase-capture-port'&&e.data.token===token&&e.ports[0]){port=e.ports[0];resolve(port);}};
    window.addEventListener('message',listener);
  });
  function dispose(){
    if(disposed)return;disposed=true;clearInterval(heartbeat);wake?.();window.removeEventListener('message',listener);
    stream?.getTracks().forEach(t=>t.stop());
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Capture stopped.'));}pending.clear();port?.close();
    if(session)void bridge.nativeCaptureStop(session.id).catch(()=>{});
    bridge.logDiagnostics?.('info',`capture metrics ${JSON.stringify({frames,bytes,paintMs:Math.round(paintMs),elapsedMs:Math.round(performance.now()-began)})}`);
  }
  function request(type,timeoutMs=type==='frame'?0:12000){return new Promise((resolve,reject)=>{
    const id=++serial,timer=timeoutMs?setTimeout(()=>{pending.delete(id);reject(Error('Screen capture stopped responding.'));},timeoutMs):null;
    pending.set(id,{resolve,reject,timer});port.postMessage({type,request:id});
  });}
  try{
    session=await bridge.nativeCaptureStart(sourceId,fps,token,selection);
    await captureDeadline(incoming,2000,'Capture channel did not open.',late=>late.close());
    window.removeEventListener('message',listener);
    port.onmessage=e=>{const p=pending.get(e.data.request);if(!p)return;pending.delete(e.data.request);clearTimeout(p.timer);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data);};port.start();
    const canvas=document.createElement('canvas');canvas.width=session.width;canvas.height=session.height;
    const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('Could not create the recording surface.');
    context.imageSmoothingQuality='high';
    const resize=document.createElement('canvas');
    function draw(frame){
      const started=performance.now(),p=frame.pixels,data=new ImageData(new Uint8ClampedArray(p.buffer,p.byteOffset,p.byteLength),frame.width,frame.height);
      if(canvas.width===frame.width&&canvas.height===frame.height)context.putImageData(data,0,0);
      else {if(resize.width!==frame.width||resize.height!==frame.height){resize.width=frame.width;resize.height=frame.height;}resize.getContext('2d').putImageData(data,0,0);context.drawImage(resize,0,0,canvas.width,canvas.height);}
      frames++;bytes+=p.byteLength;paintMs+=performance.now()-started;
    }
    const first=await request('frame',12000);if(!first.frame)throw Error('No screen frame received.');draw(first.frame);stream=canvas.captureStream(fps);
    // An unchanged desktop may legitimately produce no new frame. Check process
    // liveness separately rather than treating a quiet scene as a capture failure.
    let checking=false;
    heartbeat=setInterval(async()=>{if(disposed||checking)return;checking=true;try{await request('ping',5000);}catch(error){if(!disposed){dispose();onEnded?.(error);}}finally{checking=false;}},4000);
    void (async()=>{try{
      while(!disposed){
        if(paused){await new Promise(r=>wake=r);wake=null;continue;}
        const next=await request('frame');if(disposed)return;
        if(next.paused||paused)continue;if(next.ended){dispose();onEnded?.();return;}if(next.frame)draw(next.frame);
      }
    }catch(error){if(!disposed){dispose();onEnded?.(error);}}})();
    let transition=Promise.resolve();
    return {stream,dispose,sourceSize:session.sourceSize,crop:session.crop,
      setPaused(value){if(value)paused=true;transition=transition.then(async()=>{if(disposed)return;await request(value?'pause':'resume');if(!value){paused=false;wake?.();}});return transition;},
    };
  }catch(error){dispose();throw error;}
}
