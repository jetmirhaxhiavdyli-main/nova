import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lockedSize,ratioText} from '../src/areaRatio.mjs';
const max={width:1920,height:1080};
test('the other dimension follows the edited one',()=>{
  assert.deepEqual(lockedSize({width:800,height:338},'width',16/9,max),{width:800,height:450});
  assert.deepEqual(lockedSize({width:600,height:600},'height',16/9,max),{width:1067,height:600});
});
test('results are shrunk to the screen and grown to the minimum, keeping the ratio',()=>{
  assert.deepEqual(lockedSize({width:3840,height:100},'width',16/9,max),{width:1920,height:1080});
  const small=lockedSize({width:60,height:60},'width',2,max);
  assert.deepEqual(small,{width:240,height:120}); // height raised to 120, width follows at 2:1
});
test('without a ratio nothing changes; ratios read as familiar shapes',()=>{
  assert.deepEqual(lockedSize({width:500,height:300},'width',0,max),{width:500,height:300});
  assert.equal(ratioText(16/9),'16:9');assert.equal(ratioText(1),'1:1');assert.equal(ratioText(1.37),'1.37:1');
});
