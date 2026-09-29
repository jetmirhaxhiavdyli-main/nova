import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCameraSync} from '../src/syncRecordedCamera.mjs';
test('camera does not restart pending seeks or play promises every animation frame',async()=>{
 let seeks=0,plays=0,time=0,finish;
 const video={readyState:2,duration:10,seeking:false,paused:true,ended:false,pause(){this.paused=true;},play(){plays++;return new Promise(r=>finish=r);},get currentTime(){return time;},set currentTime(t){seeks++;time=t;this.seeking=true;}};
 const sync=createCameraSync(video,()=>1000);
 sync(2,true);for(let i=0;i<60;i++)sync(3+i/60,true);
 assert.equal(seeks,1);assert.equal(plays,1);finish();await Promise.resolve();
 video.seeking=false;sync(4,false);assert.equal(seeks,2);assert.equal(video.playbackRate,1);
});
test('slow seeks settle instead of chasing the playhead forever',()=>{
 // Each seek takes 1.2 s (a camera file with few keyframes); the playhead keeps moving meanwhile.
 let clock=0,seeks=0,seekDone=0;
 const video={readyState:2,duration:120,seeking:false,paused:false,ended:false,currentTime:0,playbackRate:1,pause(){},play(){return Promise.resolve();}};
 let pos=0;Object.defineProperty(video,'currentTime',{get:()=>pos,set:t=>{seeks++;pos=t;video.seeking=true;seekDone=clock+1200;}});
 const sync=createCameraSync(video,()=>clock);
 for(;clock<20000;clock+=16){
  if(video.seeking&&clock>=seekDone)video.seeking=false;
  if(!video.seeking)pos+=.016*video.playbackRate;
  sync(30+clock/1000,true);
 }
 assert.ok(seeks<=3,`seeks: ${seeks}`);
 assert.ok(Math.abs(pos-(30+clock/1000))<.5,`drift: ${pos-(30+clock/1000)}`);
});
