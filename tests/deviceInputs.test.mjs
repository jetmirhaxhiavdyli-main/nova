import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceInputs,inputStatus} from '../src/deviceInputs.mjs';
function trackStream(){const track=new EventTarget();track.stopped=false;track.readyState='live';track.stop=()=>{track.stopped=true;track.readyState='ended';};return {track,getTracks:()=>[track]};}

test('recording reuses live preview without reopening or enumerating devices',async()=>{
 let opens=0,enumerations=0;const s=trackStream();
 const controller=createDeviceInputs({mediaDevices:{enumerateDevices:async()=>{enumerations++;return [{kind:'videoinput',deviceId:'a'}];},getUserMedia:async()=>{opens++;return s;}},update:()=>{}});
 await controller.select('camera','a');const before=enumerations;
 assert.equal((await controller.prepare()).camera,s);assert.equal(opens,1);assert.equal(enumerations,before);assert.equal(s.track.stopped,false);controller.dispose();
});

test('camera and microphone initialize concurrently and clean up after one fails',async()=>{
 const pending=[],late=trackStream();
 const controller=createDeviceInputs({storage:{getItem:k=>k.endsWith('camera')?'cam':'mic'},mediaDevices:{getUserMedia:constraints=>new Promise((resolve,reject)=>pending.push({constraints,resolve,reject}))},update:()=>{}});
 const ready=controller.prepare();assert.equal(pending.length,2,'both requests start before either resolves');
 pending.find(p=>p.constraints.audio).reject(Error('Microphone failed'));
 await assert.rejects(ready,/Microphone failed/);
 pending.find(p=>p.constraints.video).resolve(late);await new Promise(r=>setTimeout(r,0));
 assert.equal(late.track.stopped,true);controller.dispose();
});

test('stalled input times out and a late device response is released',async()=>{
 let resolve;const late=trackStream(),state={};
 const controller=createDeviceInputs({openTimeoutMs:15,storage:{getItem:k=>k.endsWith('mic')?'mic':null},mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)},update:(k,p)=>state[k]={...state[k],...p}});
 await assert.rejects(controller.prepare(),/Microphone took too long/);assert.equal(state.mic.status,'error');
 resolve(late);await new Promise(r=>setTimeout(r,0));assert.equal(late.track.stopped,true);controller.dispose();
});
test('late camera permission result cannot reopen after Off; devices release on close',async()=>{
 let resolve;const state={};const s=trackStream();
 const controller=createDeviceInputs({mediaDevices:{enumerateDevices:async()=>[{kind:'videoinput',deviceId:'a',label:'Cam'}],getUserMedia:()=>new Promise(r=>resolve=r)},update:(k,p)=>Object.assign(state,p)});
 const pending=controller.select('camera','a');await controller.select('camera',null);resolve(s);await pending;
 assert.equal(s.track.stopped,true);assert.equal(state.selectedId,null);assert.equal(state.stream,null);controller.dispose();
});
test('recording keeps inputs when picker closes, disconnect reports and stops stream',async()=>{
 const ended=[],state={};let s;
 const controller=createDeviceInputs({mediaDevices:{enumerateDevices:async()=>[{kind:'videoinput',deviceId:'a',label:'Cam'}],getUserMedia:async()=>s=trackStream()},update:(k,p)=>state[k]={...state[k],...p},onEnded:k=>ended.push(k)});
 await controller.select('camera','a');await controller.preview(null);assert.equal(s.track.stopped,true);
 const devices=await controller.prepare();await controller.preview(null);assert.equal(devices.camera.track.stopped,false);
 devices.camera.track.dispatchEvent(new Event('ended'));assert.deepEqual(ended,['camera']);assert.equal(state.camera.status,'disconnected');controller.release();controller.dispose();
});
test('permission and missing-device errors map to existing UI states',()=>{
 for(const [name,status] of [['NotAllowedError','denied'],['NotFoundError','none'],['NotReadableError','error'],['OverconstrainedError','disconnected']])assert.equal(inputStatus({name}),status);
});
