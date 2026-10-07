import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickFrame} from '../src/frameSelect.mjs';
test('picks the latest frame on screen by the middle of the output frame',()=>{
  const times=[0,0.0167,0.0333,0.0667,0.0833,0.1]; // a gap where a frame was dropped
  assert.equal(pickFrame(times,0,60),0);
  assert.equal(pickFrame(times,1/60,60),1);
  assert.equal(pickFrame(times,2/60,60),2);
  assert.equal(pickFrame(times,3/60,60),2); // 0.05+0.0083=0.0583: still frame 2
  assert.equal(pickFrame(times,4/60,60),3);
  assert.equal(pickFrame(times,10,60),5);   // past the end: the last frame
});
test('never goes backwards and tolerates jitter around the frame grid',()=>{
  const times=Array.from({length:120},(_,k)=>k/60+(k%3===0?0.004:-0.003)); // +-4 ms jitter
  let last=-1,seen=new Set();
  for(let i=0;i<120;i++){const k=pickFrame(times,i/60,60);assert.ok(k>=last);last=k;seen.add(k);}
  assert.equal(seen.size,120); // every source frame appears exactly once
});
