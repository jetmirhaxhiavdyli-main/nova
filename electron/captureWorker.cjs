// Isolated native/driver calls. Pixels go directly to the renderer's port.
let capture, first, options, native, port, busy=false, paused=false, crop, sourceSize;
async function begin(){capture=new native.ScreenCapture(options);await capture.start();first=await capture.nextFrame();if(!first)throw Error('The selected source did not produce a frame.');}
async function start(message){
  native=await import('@screen-capture/node');
  if(!native.isSupported()||!native.captureApiSupport().cursorSettings)throw Error('Cursor-free capture is unavailable.');
  let target;
  if(message.sourceId.startsWith('window:'))target={windowHandle:Number(message.sourceId.split(':')[1])};
  else {
    const d=message.display;if(!d)throw Error('Cannot identify this display.');
    const matches=native.enumerateMonitors().filter(m=>m.name===d.label&&Math.abs(m.width-d.size.width*d.scaleFactor)<2&&Math.abs(m.height-d.size.height*d.scaleFactor)<2);
    const monitor=d.id===message.primaryId?native.primaryMonitor():matches.length===1?matches[0]:null;
    if(!monitor)throw Error('Cannot identify this display for smooth cursor capture.');
    target={monitorIndex:monitor.index};
  }
  options={...target,cursorCapture:false,drawBorder:false,colorFormat:'rgba8',minimumUpdateIntervalMs:message.fps===60?16:33};
  const {cropPixels}=await import('./captureGeometry.mjs');
  await begin();sourceSize={width:first.width,height:first.height};
  crop=message.selection?cropPixels(message.selection.area,message.selection.geometry,message.selection.viewport,sourceSize):null;
  process.parentPort.postMessage({type:'ready',info:{sourceSize,crop,width:crop?.width||first.width,height:crop?.height||first.height,fps:message.fps}});
}
async function command(m){
  if(busy&&m.type==='frame'){port.postMessage({request:m.request,error:'A frame is already pending.'});return;}
  try{
    if(m.type==='ping'){port.postMessage({request:m.request,ok:true});return;}
    if(m.type==='pause'){paused=true;await capture?.stop();first=null;port.postMessage({request:m.request,ok:true});return;}
    if(m.type==='resume'){await begin();paused=false;port.postMessage({request:m.request,ok:true});return;}
    if(m.type!=='frame')return;
    busy=true;let frame=first;first=null;if(!frame&&!paused)frame=await capture.nextFrame();
    if(paused){port.postMessage({request:m.request,paused:true});return;}
    if(!frame){port.postMessage({request:m.request,ended:true});return;}
    if(crop){if(frame.width!==sourceSize.width||frame.height!==sourceSize.height)throw Error('Display size changed during area recording.');frame=frame.crop(crop.x,crop.y,crop.x+crop.width,crop.y+crop.height);}
    port.postMessage({request:m.request,frame:{width:frame.width,height:frame.height,pixels:frame.buffer}});
  }catch(error){port.postMessage({request:m.request,error:error.message});}
  finally{if(m.type==='frame')busy=false;}
}
process.parentPort.on('message',event=>{
  if(event.data.type==='start')start(event.data).catch(e=>process.parentPort.postMessage({error:e.message}));
  if(event.data.type==='port'){port=event.ports[0];port.on('message',e=>void command(e.data));port.start();}
});
