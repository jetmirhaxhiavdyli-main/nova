import {test} from 'node:test';
import assert from 'node:assert/strict';
import {peaksFromChannels} from '../src/timelineMedia.mjs';

test('voice peaks are normalised per bucket and flag speech above the noise floor', () => {
  // 1 s at 1 kHz: faint noise, then a loud tone in the middle third.
  const rate = 1000, ch = new Float32Array(rate);
  for (let i = 0; i < rate; i++) ch[i] = i >= 333 && i < 666 ? 0.5 * Math.sin(i / 3) : 0.002 * Math.sin(i * 7);
  const peaks = peaksFromChannels([ch, ch], 10);
  assert.equal(peaks.length, 10);
  assert.equal(Math.max(...peaks.map(p => p.peak)), 1);
  assert.ok(peaks[4].speech && peaks[5].speech && !peaks[0].speech && !peaks[8].speech);
  assert.ok(peaks[0].peak < 0.05 && peaks[4].peak > 0.8);
  assert.deepEqual(peaksFromChannels([new Float32Array(0)], 10), []);
});
