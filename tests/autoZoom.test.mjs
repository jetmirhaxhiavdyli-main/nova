import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZoomMotion, generateZoomTimeline } from '../src/autoZoom.mjs';
import { FULL_FRAME, createZoomSampler, updateZoomSegment, addZoomSegment, removeZoomSegment, validateZoomTimeline } from '../src/zoomTimeline.mjs';
const near=(a,b,epsilon=.00002)=>{for(const k of Object.keys(FULL_FRAME))assert(Math.abs(a[k]-b[k])<epsilon,`${k}: ${a[k]} != ${b[k]}`);};

test('related clicks hold one segment without resetting its camera',()=>{
  const zoom=createZoomMotion({holdMs:2600});zoom.click(.5,.5,0);
  const settled=zoom.frame(2000);near(settled,{x:(1-1/1.55)/2,y:(1-1/1.55)/2,width:1/1.55,height:1/1.55},.002);
  zoom.click(.53,.52,2000);
  near(zoom.frame(3000),settled,.002);
  const timeline=zoom.snapshot(7000);
  assert.equal(timeline.segments.length,1);assert.equal(timeline.segments[0].keyframes.length,0);
  assert.equal(timeline.segments[0].release,4600);
  assert.deepEqual(zoom.frame(7000),FULL_FRAME);
});

test('typing, scrolling and purposeful motion hold framing; jitter and hovering do not',()=>{
  const zoom=createZoomMotion({holdMs:2600});zoom.click(.5,.5,0);
  for(let t=100;t<2000;t+=100)zoom.pointer({x:.501,y:.499,visible:true},t);
  assert.equal(zoom.snapshot(8000).segments[0].release,2600);
  zoom.activity('typing',.5,.5,2200);zoom.activity('scroll',.5,.5,4000);
  zoom.pointer({x:.55,y:.5,visible:true},6000);
  const segment=zoom.snapshot(20000).segments[0];assert.equal(segment.release,6600);assert.equal(segment.keyframes.length,0);
  near(zoom.frame(6500), {x:(1-1/1.55)/2,y:(1-1/1.55)/2,width:1/1.55,height:1/1.55});
  const empty=createZoomMotion({holdMs:2600});empty.pointer({x:.4,y:.4},0);empty.activity('typing',.4,.4,100);
  assert.equal(empty.snapshot(1000).segments.length,0);
});

test('safe region avoids chasing the mouse, but crossing it reframes smoothly',()=>{
  const zoom=createZoomMotion({holdMs:2600});zoom.click(.5,.5,0);const before=zoom.frame(1200);
  zoom.pointer({x:.55,y:.5},1100);assert.equal(zoom.snapshot(6000).segments[0].keyframes.length,0);
  zoom.pointer({x:.95,y:.9},1200);near(zoom.frame(1200),before);
  const panned=zoom.frame(1800);assert(panned.x>before.x);assert(panned.y>before.y);
  for(let t=1800;t<6000;t+=17){const f=zoom.frame(t);assert(f.x>=0&&f.y>=0&&f.x+f.width<=1&&f.y+f.height<=1);}
  zoom.click(-1,.5,6100);zoom.click(NaN,.5,6200);zoom.activity('typing',2,.5,6300);
  assert.equal(zoom.snapshot(7000).segments.length,1);
});

test('serialized timeline replays live camera identically, including backward seeking',()=>{
  const zoom=createZoomMotion({holdMs:2600}),samples=[];
  for(let t=0;t<=7000;t+=20){
    if(t===100)zoom.click(.2,.3,t);
    if(t===1600)zoom.click(.8,.7,t);
    if(t===2800)zoom.activity('typing',.8,.7,t);
    samples.push([t,zoom.frame(t)]);
  }
  const doc=JSON.parse(JSON.stringify(zoom.snapshot(20000))),sample=createZoomSampler(doc);
  for(const [time,frame] of samples)near(sample(time),frame);
  for(const [time,frame] of samples.slice().reverse())near(sample(time),frame);
  assert.equal(doc.timebase,'ms');assert.equal(doc.duration,20000);
});

test('stopping inside a zoom preserves the last camera instead of inserting a zoom-out',()=>{
  const zoom=createZoomMotion({holdMs:2600});zoom.click(.25,.25,100);
  const frame=zoom.frame(450),doc=zoom.snapshot(450);
  near(createZoomSampler(doc)(450),frame);
  assert.equal(doc.segments[0].end,450);assert.equal(doc.segments[0].release,450);
});

test('editor can move, resize, retarget, change strength/easing, disable, delete and add segments',()=>{
  const zoom=createZoomMotion({holdMs:2600});zoom.click(.3,.3,500);
  const doc=zoom.snapshot(10000),id=doc.segments[0].id,original=JSON.stringify(doc);
  const edited=updateZoomSegment(doc,id,{start:1000,release:5000,end:6500,scale:2,target:{x:.8,y:.7},easing:{zoom:14,pan:10,out:8}});
  assert.equal(edited.segments[0].origin,'manual');assert.equal(edited.segments[0].start,1000);
  const sample=createZoomSampler(edited);assert.deepEqual(sample(900),FULL_FRAME);near(sample(4000),{x:.5,y:.45,width:.5,height:.5});
  assert.equal(JSON.stringify(doc),original);
  assert.deepEqual(createZoomSampler(updateZoomSegment(doc,id,{enabled:false}))(2000),FULL_FRAME);
  const deleted=removeZoomSegment(doc,id);assert.deepEqual(createZoomSampler(deleted)(2000),FULL_FRAME);
  const added=addZoomSegment(deleted,{...doc.segments[0],id:'manual-1'});assert(createZoomSampler(added)(2000).width<.7);
  assert.throws(()=>updateZoomSegment(doc,id,{scale:0}));assert.throws(()=>validateZoomTimeline({...doc,segments:[...doc.segments,...doc.segments]}));
});

test('a click right after the zoom ends continues it smoothly, without a jump',()=>{
  const zoom=createZoomMotion({holdMs:2600});zoom.click(.3,.3,0);zoom.click(.8,.7,3000);
  const doc=zoom.snapshot(7000),sample=createZoomSampler(doc),a=sample(2999),b=sample(3000),c=sample(3001);
  assert(Math.abs((b.width-a.width)-(c.width-b.width))<.0001,'no jump in the camera');
  const frame=createZoomSampler(doc)(4000);assert(frame.width<.66);assert(frame.x>.3);
});

test('disabled auto-zoom retains suggestions while rendering full view',()=>{
  const zoom=createZoomMotion({enabled:false});zoom.click(.4,.4,100);
  assert.deepEqual(zoom.frame(1200),FULL_FRAME);const doc=zoom.snapshot(5000);assert.equal(doc.segments.length,1);
  assert(createZoomSampler({...doc,enabled:true})(1200).width<.7);
});

test('recorded metadata regenerates the same automatic editable starting point',()=>{
  const events=[{type:'click',x:.3,y:.4,time:100},{type:'pointer',x:.8,y:.6,time:800},
    {type:'activity',kind:'typing',x:.8,y:.6,time:2000},{type:'click',x:.5,y:.5,time:5000}];
  const live=createZoomMotion({holdMs:2600});
  live.click(.3,.4,100);live.frame(400);live.pointer(events[1],800);live.frame(1000);
  live.activity('typing',.8,.6,2000);live.frame(4800);live.click(.5,.5,5000);
  const regenerated=generateZoomTimeline(events,8000,{holdMs:2600});
  assert.deepEqual(regenerated,live.snapshot(8000));
  assert.deepEqual(generateZoomTimeline(events.slice().reverse(),8000,{holdMs:2600}),regenerated);
});


test('demo zooms take time to enter and return without a visible final snap',()=>{
  const zoom=createZoomMotion({holdMs:2600});zoom.click(.5,.5,0);
  const target=1/1.55;
  const progress=(1-zoom.frame(200).width)/(1-target);
  assert(progress>.2 && progress<.35); // zooms in gently
  assert((1-zoom.frame(1000).width)/(1-target)>.95);
  const duringReturn=zoom.frame(2800).width;
  assert((duringReturn-target)/(1-target)>.4 && (duringReturn-target)/(1-target)<.65); // zooms out faster than it zooms in
  const nearEnd=zoom.frame(3799).width;
  assert(1-nearEnd<.0001);assert.deepEqual(zoom.frame(3800),FULL_FRAME);
});

test('mouse movement does not keep a zoom alive, and a zoom open at the end still zooms out before the clip ends',()=>{
  const zoom=createZoomMotion({holdMs:2600});zoom.click(.5,.5,1000);
  for(let t=1200;t<20000;t+=100)zoom.pointer({x:.2+(t%1000)/5000,y:.5,visible:true},t);
  assert.equal(zoom.snapshot(30000).segments[0].release,3600);
  const open=createZoomMotion({holdMs:2600});open.click(.5,.5,1000);for(const at of [3000,5000,7000])open.activity('typing',.5,.5,at);
  const s=open.snapshot(10000).segments[0];assert.equal(s.release,8800);assert.equal(s.end,10000);
  near(createZoomSampler(open.snapshot(10000))(10000),FULL_FRAME,.001);
});

test('by default a long pause ends the zoom, but a click soon after one continues it instead of zooming out and back in',()=>{
  const zoom=createZoomMotion();zoom.click(.3,.3,1000);zoom.click(.7,.6,4500); // 4500 is 1300 ms after the first zoom ended (3200)
  assert.equal(zoom.snapshot(30000).segments.length,1);
  assert.equal(zoom.snapshot(30000).segments[0].release,6700);
  zoom.click(.5,.5,12000);
  const [first,second]=zoom.snapshot(30000).segments;
  assert.equal(first.release,6700);assert.equal(second.start,12000);
});
