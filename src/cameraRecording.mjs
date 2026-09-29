// H.264 first (GPU encode where available). A keyframe every second keeps seeks cheap in the editor and export;
// MediaRecorder's default is a single keyframe, which makes every seek decode from the start.
export const CAMERA_TYPES=['video/webm;codecs=h264','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
export const KEYFRAME_MS=1000;

export function recordCamera(stream,onError,isSupported=type=>MediaRecorder.isTypeSupported(type)) {
  const mimeType=CAMERA_TYPES.find(isSupported)||'';
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6000000,videoKeyFrameIntervalDuration:KEYFRAME_MS});
  const chunks=[];let failed=null;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onerror=e=>{failed=e.error||Error('Camera recording failed');onError?.(failed);};
  const done=new Promise(resolve=>recorder.addEventListener('stop',()=>resolve(),{once:true}));
  return {recorder,async finish(){
    if(recorder.state!=='inactive')recorder.stop();
    await done;
    return !failed&&chunks.length?new Blob(chunks,{type:mimeType||'video/webm'}):null;
  }};
}
