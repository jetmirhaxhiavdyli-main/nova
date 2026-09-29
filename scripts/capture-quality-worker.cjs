// Test-only worker: compare full-frame transport + renderer crop with native crop.
let capture;
process.parentPort.on('message',async({data})=>{
  try{
    if(data.type==='start'){
      const {ScreenCapture}=await import('@screen-capture/node');
      capture=new ScreenCapture({windowHandle:data.handle,cursorCapture:false,drawBorder:false,colorFormat:'rgba8',minimumUpdateIntervalMs:33});
      await capture.start();
    }
    const frame=await capture.nextFrame();if(!frame)throw Error('No test frame.');
    const x=40,y=40,width=Math.floor((frame.width-80)/2)*2,height=Math.floor((frame.height-80)/2)*2;
    const cropped=frame.crop(x,y,x+width,y+height);
    process.parentPort.postMessage({full:frame.buffer,pixels:cropped.buffer,sourceWidth:frame.width,x,y,width,height});
  }catch(error){process.parentPort.postMessage({error:error.message});}
});
