import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorZooms, motionTimeline, editorCamera, editorCursor } from '../src/editorMotion.mjs';
import { generateZoomTimeline } from '../src/autoZoom.mjs';
import { createZoomSampler, validateZoomTimeline } from '../src/zoomTimeline.mjs';

const events=[{type:'click',time:500,x:.7,y:.4},{type:'pointer',time:900,x:.9,y:.8,visible:true}];
const original=generateZoomTimeline(events,6000);
test('editor replays generated camera identically including backwards seeks',()=>{
  const a=createZoomSampler(original),b=editorCamera(editorZooms(original),6);
  for(const t of [0,500,750,1200,3000,5999,850]) assert.deepEqual(b(t),a(t));
});
test('resizing retains targets, return phase and valid metadata without mutating source',()=>{
  const before=JSON.stringify(original), blocks=editorZooms(original);
  blocks[0]={...blocks[0],start:.1,end:2,level:2};
  const next=motionTimeline(blocks,6); validateZoomTimeline(next);
  assert.equal(next.segments[0].scale,2); assert.equal(JSON.stringify(original),before);
  const fixed=motionTimeline([{...blocks[0],mode:'fixed'}],6);
  assert.equal(fixed.segments[0].keyframes.length,0);
});
test('cursor has visibility gaps, smoothing and deterministic reverse seeking',()=>{
  const points=[{type:'pointer',time:0,x:0,y:0},{type:'pointer',time:100,x:1,y:1},{type:'pointer',time:300,visible:false}];
  const sample=editorCursor(points); const mid=sample(150);
  assert.ok(mid.x>0 && mid.x<1); assert.equal(sample(350),null);
  assert.deepEqual(sample(150),mid); assert.equal(editorCursor(points,0)(150).x,1);
});
test('smooth cursor keeps pace with the pointer and is exactly on target at each click',()=>{
  // Pointer glides (0,0)→(1,0.5) over 300 ms, stops, and clicks at 320 ms (the case users saw lagging).
  const events=[];for(let t=0;t<=600;t+=16)events.push({type:'pointer',time:t,x:Math.min(1,t/300),y:Math.min(.5,t/600)});
  events.push({type:'click',time:320,x:1,y:.5});
  const sample=editorCursor(events),atClick=sample(320);
  assert.ok(Math.abs(atClick.x-1)<1e-6&&Math.abs(atClick.y-.5)<1e-6,'cursor sits on the click point at the click');
  // Pointer is at x≈0.67 here. The old trailing spring was ~200 ms behind (x≈0.33); allow ~50 ms of catch-up from rest.
  const moving=editorCursor(events)(200);
  assert.ok(Math.abs(moving.x-200/300)<.17,`cursor keeps up while moving (got ${moving.x})`);
  const noClick=editorCursor(events.filter(e=>e.type!=='click'));assert.ok(noClick(900).x>.995,'settles on a still pointer');
  assert.deepEqual(sample(250),editorCursor(events)(250),'reverse seek is deterministic');
});
test('instant zoom snaps to target and disabled suggestions remain inactive',()=>{
  const blocks=editorZooms(original);blocks[0].instant=true;
  assert.equal(editorCamera(blocks,6)(500).width,1/blocks[0].level);
  blocks[0].enabled=false;assert.equal(editorCamera(blocks,6)(1000).width,1);
});

test('click alignment uses click coordinates between pointer polls',()=>{
 const events=[{type:'pointer',time:0,x:.1,y:.1},{type:'pointer',time:96,x:.3,y:.3},
 {type:'click',time:100,x:.4,y:.5},{type:'pointer',time:112,x:.45,y:.55}];
 const sample=editorCursor(events);
 assert.deepEqual(sample(100),{x:.4,y:.5});
 sample(500);assert.deepEqual(sample(100),{x:.4,y:.5});
});

test('centred smoothing has no steady-travel lag and cannot anticipate a hidden segment',()=>{
 const events=[];
 for(let time=0;time<=1000;time+=10)events.push({type:'pointer',time,x:time/1000,y:.5});
 const sample=editorCursor(events,100);
 for(const t of [200,333,600,800,250])assert.ok(Math.abs(sample(t).x-t/1000)<1e-10);
 const gap=editorCursor([{type:'pointer',time:0,x:.1,y:.1},{type:'pointer',time:200,visible:false},
 {type:'pointer',time:300,x:.9,y:.9}],100);
 assert.ok(Math.abs(gap(180).x-.1)<1e-10);assert.equal(gap(250),null);assert.ok(Math.abs(gap(300).x-.9)<1e-10);
});
