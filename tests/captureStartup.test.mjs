import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {captureDeadline} from '../src/captureDeadline.mjs';
import {createNativeCapture} from '../electron/nativeCaptureHost.cjs';
import {recordMotion} from '../src/recordingMotion.mjs';
import {createZoomMotion} from '../src/autoZoom.mjs';
import {recordingMime} from '../src/recordingCodec.mjs';
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
test('even captures retain codec preference; odd captures preserve edge pixels',()=>{
  assert.equal(recordingMime({width:1920,height:1080,hasMic:true},()=>true),'video/webm;codecs=h264,opus');
  assert.equal(recordingMime({width:803,height:453,hasMic:true},()=>true),'video/webm;codecs=vp9,opus');
  assert.equal(recordingMime({width:803,height:454},t=>t.includes('vp8')),'video/webm;codecs=vp8');
});
test('a capture completing after its deadline is disposed exactly once',async()=>{
  const late=defer();let count=0;
  await assert.rejects(captureDeadline(late.promise,5,'timeout',v=>{assert.equal(v,'stream');count++;}),/timeout/);
  late.resolve('stream');await tick();assert.equal(count,1);
  const failure=defer();await assert.rejects(captureDeadline(failure.promise,5,'timeout'),/timeout/);
  failure.reject(Error('driver failure'));await tick();
});
function host(overrides={}){
  const children=[],ports=[];
  const h=createNativeCapture({
    desktopCapturer:{getSources:async()=>[{id:'screen:0:0',display_id:'1'}]},
    screen:{getAllDisplays:()=>[{id:1}],getPrimaryDisplay:()=>({id:1})},
    utilityProcess:{fork:()=>{const c=new EventEmitter();c.killed=0;c.kill=()=>{c.killed++;};c.postMessage=(...m)=>c.sent=m;children.push(c);queueMicrotask(()=>c.emit('spawn'));return c;}},
    MessageChannelMain:class{port1={};port2={};},deliverPort:(...args)=>ports.push(args),timeoutMs:25,...overrides,
  });return {h,children,ports};
}
test('a stalled native child is killed by the independent watchdog',async()=>{
  const {h,children}=host();await assert.rejects(h.start('screen:0:0',30,'a'),/timed out/);
  assert.equal(children.length,1);assert.equal(children[0].killed,1);
});
test('late enumeration cannot create a capture child after cancellation',async()=>{
  const pending=defer(),{h,children}=host({desktopCapturer:{getSources:()=>pending.promise}});
  await assert.rejects(h.start('screen:0:0',30,'a'),/timed out/);
  pending.resolve([{id:'screen:0:0',display_id:'1'}]);await tick();assert.equal(children.length,0);
});
test('a superseded start and stale cleanup cannot kill a newer capture',async()=>{
  const {h,children,ports}=host({timeoutMs:1000});
  const first=h.start('screen:0:0',30,'a'),rejected=assert.rejects(first,/stopped/);
  const next=h.start('screen:0:0',30,'b');await rejected;await tick();
  assert.equal(children.length,1);
  children[0].emit('message',{type:'ready',info:{width:320,height:200}});
  const result=await next;assert.equal(result.id,2);assert.equal(ports[0][0].token,'b');
  await h.stop(1);assert.equal(children[0].killed,0);await h.stop(result.id);assert.equal(children[0].killed,1);
});
test('a child crash produces a startup error and cleans up',async()=>{
  const {h,children}=host({timeoutMs:1000});const pending=h.start('screen:0:0',30,'a');
  const rejected=assert.rejects(pending,/stopped \(7\)/);await tick();children[0].emit('exit',7);await rejected;assert.equal(children[0].killed,1);
});
test('deferred motion matches live zoom authoring, maps crop and ignores paused events',()=>{
  const listeners={},bridge={};let now=0,paused=false;
  for(const [api,type] of [['onRecordingClick','click'],['onRecordingPointer','pointer'],['onRecordingActivity','activity']])bridge[api]=f=>{listeners[type]=f;return()=>delete listeners[type];};
  const motion=recordMotion({bridge,sourceSize:{width:1000,height:500},crop:{x:100,y:50,width:500,height:250},zoomEnabled:true,clock:()=>now,isPaused:()=>paused});
  now=100;listeners.click({x:.35,y:.35});
  now=500;listeners.pointer({x:.55,y:.55});
  paused=true;now=600;listeners.click({x:.4,y:.4});paused=false;
  now=700;listeners.activity({kind:'typing',x:.4,y:.4});
  now=900;listeners.pointer({x:.9,y:.9});
  const expected=createZoomMotion();expected.click(.5,.5,100);expected.pointer({x:.9,y:.9,visible:true},500);expected.activity('typing',.6,.6,700);expected.pointer({visible:false},900);
  assert.deepEqual(motion.snapshot(2000),expected.snapshot(2000));assert.equal(motion.events.length,4);
  assert.deepEqual(motion.events.at(-1),{type:'pointer',visible:false,time:900});motion.dispose();assert.deepEqual(listeners,{});
});
