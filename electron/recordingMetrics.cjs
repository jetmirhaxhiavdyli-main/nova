// Low-frequency local diagnostics. No device names, window titles, content or user input.
function createRecordingMetrics(app,log,intervalMs=5000){
  let timer;
  function sample(){try{log({event:'recording-processes',processes:app.getAppMetrics().map(p=>({type:p.type,service:p.name==='Nova Capture'?'capture':undefined,cpuPercent:p.cpu.percentCPUUsage,workingSetKB:p.memory.workingSetSize}))});}catch{}}
  function stop(){if(!timer)return;clearInterval(timer);timer=null;sample();}
  function start(){stop();try{log({event:'recording-graphics',features:app.getGPUFeatureStatus()});}catch{}sample();timer=setInterval(sample,intervalMs);timer.unref?.();}
  return {start,stop};
}
module.exports={createRecordingMetrics};
