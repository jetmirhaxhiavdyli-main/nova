export const inputStatus = error => ({NotAllowedError:'denied',SecurityError:'denied',NotFoundError:'none',OverconstrainedError:'disconnected',NotReadableError:'error',AbortError:'error'}[error?.name] || 'error');

/** Owns permissions and stream lifetimes. A generation prevents late permission
 * responses from reopening a device after Off/close or a different selection. */
export function createDeviceInputs({mediaDevices,update,onEnded,storage,createAudioContext=()=>new AudioContext(),openTimeoutMs=12000}) {
  const kinds=['camera','mic'],streams={},ids={},generation={camera:0,mic:0};
  let locked=false,disposed=false,meter=null,meterTimer=null;
  for(const kind of kinds){try{ids[kind]=storage?.getItem('showcase-'+kind)||null;}catch{ids[kind]=null;}}
  function persist(kind){try{if(ids[kind])storage?.setItem('showcase-'+kind,ids[kind]);else storage?.removeItem('showcase-'+kind);}catch{}}
  function stopMeter(){clearInterval(meterTimer);meterTimer=null;meter?.close().catch(()=>{});meter=null;}
  function stop(kind){
    generation[kind]++;
    if(kind==='mic')stopMeter();
    streams[kind]?.getTracks().forEach(t=>t.stop());delete streams[kind];
    if(!disposed)update(kind,{stream:null,level:0});
  }
  async function refresh(){
    try{
      const devices=await mediaDevices.enumerateDevices();if(disposed)return;
      for(const kind of kinds){
        const list=devices.filter(d=>d.kind===(kind==='camera'?'videoinput':'audioinput')).map((d,i)=>({id:d.deviceId,name:d.label||`${kind==='camera'?'Camera':'Microphone'} ${i+1}`}));
        if(ids[kind]&&!list.some(d=>d.id===ids[kind])){const wasLocked=locked;stop(kind);ids[kind]=null;persist(kind);if(wasLocked)onEnded?.(kind);}
        update(kind,{devices:list,selectedId:ids[kind],status:list.length?'ready':'none'});
      }
    }catch(error){if(!disposed)for(const kind of kinds)update(kind,{status:inputStatus(error)});}
  }
  async function open(kind,permissionOnly=false){
    stop(kind);const token=generation[kind];update(kind,{status:'loading'});
    let stream;
    try{
      const deviceId=ids[kind]?{exact:ids[kind]}:undefined;
      const request=mediaDevices.getUserMedia(kind==='camera'?{video:{deviceId,width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}},audio:false}:{audio:{deviceId,echoCancellation:true,noiseSuppression:true},video:false});
      let timer,expired=false;
      // getUserMedia cannot be cancelled. Release a late result after timeout.
      request.then(s=>{if(expired)s.getTracks().forEach(t=>t.stop());},()=>{});
      try{stream=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error(`${kind==='camera'?'Camera':'Microphone'} took too long to respond. Check the device or select another input.`));},openTimeoutMs);})]);}finally{clearTimeout(timer);}
      if(disposed||token!==generation[kind]){stream.getTracks().forEach(t=>t.stop());return null;}
      // Labels can refresh in the picker; enumeration is not on recording's critical path.
      if(!locked)await refresh();
      if(disposed||token!==generation[kind]){stream.getTracks().forEach(t=>t.stop());return null;}
      if(permissionOnly){stream.getTracks().forEach(t=>t.stop());return null;}
      streams[kind]=stream;update(kind,{stream,status:'ready'});
      for(const track of stream.getTracks())track.addEventListener('ended',()=>{
        if(streams[kind]!==stream)return;
        stop(kind);update(kind,{status:'disconnected'});if(locked)onEnded?.(kind);
      },{once:true});
      if(kind==='mic'&&!locked){
        meter=createAudioContext();await meter.resume().catch(error=>{if(!locked)throw error;});
        if(disposed||token!==generation[kind])return null;
        if(locked)return stream;
        const analyser=meter.createAnalyser();analyser.fftSize=512;meter.createMediaStreamSource(stream).connect(analyser);
        const data=new Float32Array(analyser.fftSize);
        meterTimer=setInterval(()=>{analyser.getFloatTimeDomainData(data);const rms=Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length);update(kind,{level:Math.min(1,rms*5)});},50);
      }
      return stream;
    }catch(error){
      stream?.getTracks().forEach(t=>t.stop());
      if(token===generation[kind]&&!disposed){stop(kind);update(kind,{status:inputStatus(error)});}
      if(locked)throw error;return null;
    }
  }
  return {
    refresh,
    async select(kind,id){if(locked)return;ids[kind]=id||null;persist(kind);update(kind,{selectedId:ids[kind]});if(id)await open(kind);else{stop(kind);await refresh();}},
    async preview(kind){if(locked)return;for(const k of kinds)if(k!==kind)stop(k);if(kind)await open(kind,!ids[kind]);},
    retry(kind){return open(kind,!ids[kind]);},
    async prepare(){
      locked=true;stopMeter();update('mic',{level:0});
      try{
        const entries=await Promise.all(kinds.map(async kind=>{
          const selected=ids[kind],existing=streams[kind];
          const reusable=existing?.getTracks().length&&existing.getTracks().every(t=>t.readyState==='live');
          const stream=selected?(reusable?existing:await open(kind)):null;
          if(selected&&!stream)throw Error(`${kind==='camera'?'Camera':'Microphone'} became unavailable. Choose a device and try again.`);
          return [kind,stream];
        }));
        return Object.fromEntries(entries);
      }catch(e){this.release();throw e;}
    },
    release(){locked=false;for(const kind of kinds)stop(kind);},
    dispose(){disposed=true;locked=false;for(const kind of kinds)stop(kind);},
  };
}
