import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ANIMATED_BACKGROUNDS,animatedBackground,animatedBackgroundProgress,animatedBackgroundFrame,backgroundKind} from '../src/components/editor/constants.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const preset of ANIMATED_BACKGROUNDS){
test(preset.id+': drift follows its configured duration and seeks deterministically',()=>{
  const s=preset.seconds;assert(Number.isFinite(s)&&s>0);
  near(animatedBackgroundProgress(preset,0),0);near(animatedBackgroundProgress(preset,s*.5),.5);
  near(animatedBackgroundProgress(preset,s),1);near(animatedBackgroundProgress(preset,s*1.5),.5);near(animatedBackgroundProgress(preset,s*2),0);
  assert(animatedBackgroundProgress(preset,s*.25)<.25);near(animatedBackgroundProgress(preset,s*.25),animatedBackgroundProgress(preset,s*1.75));
  near(animatedBackgroundProgress(preset,s*2.25),animatedBackgroundProgress(preset,s*.25));
});
test(preset.id+': geometry respects 300% CSS sizing and all stops across aspect ratios',()=>{
  for(const [w,h] of [[1920,1080],[1080,1920],[801,601]]){
    const start=animatedBackgroundFrame(w,h,preset,0),end=animatedBackgroundFrame(w,h,preset,preset.seconds);
    near(start.x0-end.x0,w*2);near(start.y0,end.y0);
    near((start.y0+start.y1)/2,h/2);near((start.x0+start.x1)/2,w*1.5);
    assert.deepEqual(start.colors,[...preset.colors,preset.colors[0]]);
  }
  assert.equal(backgroundKind({preset:preset.id}),'animated');assert.equal(animatedBackground('missing'),null);
});
}
