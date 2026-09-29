import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createZoomMotion} from '../src/autoZoom.mjs';
import {createZoomSampler,targetCrop} from '../src/zoomTimeline.mjs';

test('camera follow eases into a pan and preserves momentum on reversal',()=>{
 const camera=createZoomMotion();camera.click(.5,.5,0);
 const before=camera.frame(1800);camera.pointer({x:.95,y:.5,visible:true},1800);
 assert.deepEqual(camera.frame(1800),before);
 const a=camera.frame(1900),b=camera.frame(2000);
 assert(b.x-a.x>a.x-before.x,'pan accelerates gently instead of moving at constant speed');
 const prev=camera.frame(2199),at=camera.frame(2200);
 camera.pointer({x:.05,y:.5,visible:true},2200);
 assert.deepEqual(camera.frame(2200),at,'new target does not jump the camera');
 const after=camera.frame(2201);
 assert(Math.abs((after.x-at.x)-(at.x-prev.x))<.00001,'velocity stays continuous');
 const doc=camera.snapshot(7000),sample=createZoomSampler(doc);
 const target=targetCrop(doc.segments[0].keyframes.at(-1).target,doc.segments[0].scale);
 assert(Math.abs(sample(4400).x-target.x)<.001,'camera catches up before the hold ends');
 const back=sample(2000);for(const k of Object.keys(b))assert(Math.abs(back[k]-b[k])<1e-12,'backward seeking reproduces the same pan');
});

test('moving cursor creates smaller, more frequent pan targets without reacting to jitter',()=>{
 const camera=createZoomMotion();camera.click(.5,.5,0);
 for(let t=1800;t<=2120;t+=80)camera.pointer({x:.8+(t-1800)/320*.15,y:.5,visible:true},t);
 camera.pointer({x:.9501,y:.5001,visible:true},2200);
 const doc=camera.snapshot(7000),keys=doc.segments[0].keyframes;
 assert.equal(keys.length,5);
 const replay=createZoomSampler(doc);
 for(const t of [1800,1830,1900,2200,2600])assert.deepEqual(camera.frame(t),replay(t));
});
