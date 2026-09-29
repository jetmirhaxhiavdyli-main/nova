import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourcePresets} from '../src/exportPresets.mjs';
test('native follows capture cadence; missing legacy metadata never invents a rate',()=>{
  const presets=[{id:'recommended',fps:'30'},{id:'native',fps:'60'}];
  for(const fps of [24,30,50,60]) assert.equal(sourcePresets(presets,fps)[1].fps,String(fps));
  for(const fps of [null,undefined,0,NaN,29.97]) assert.deepEqual(sourcePresets(presets,fps),[presets[0]]);
  assert.equal(presets[1].fps,'60');
});
