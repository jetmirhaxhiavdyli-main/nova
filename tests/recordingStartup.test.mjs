import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecordingInputs} from '../src/recordingStartup.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
test('screen initialization starts without waiting for microphone initialization',async()=>{
 const device=deferred(),screen=deferred(),started=[];let released=0;
 const result=prepareRecordingInputs({prepare:()=>{started.push('mic');return device.promise;},release:()=>released++},()=>{started.push('screen');return screen.promise;});
 await Promise.resolve();assert.deepEqual(started,['mic','screen']);
 const capture={stream:{},dispose:()=>released++};screen.resolve(capture);device.resolve({mic:{}});
 assert.equal((await result).capture,capture);assert.equal(released,0);
});
for(const first of ['device','screen'])test(`${first} failure releases late resources`,async()=>{
 const device=deferred(),screen=deferred();let releases=0,disposals=0;
 const result=prepareRecordingInputs({prepare:()=>device.promise,release:()=>releases++},()=>screen.promise);
 if(first==='device')device.reject(Error('failed'));else screen.reject(Error('failed'));
 await assert.rejects(result,/failed/);
 if(first==='device')screen.resolve({dispose:()=>disposals++});else device.resolve({mic:{}});
 await new Promise(r=>setTimeout(r,0));
 assert(releases>=1);assert.equal(disposals,first==='device'?1:0);
});
