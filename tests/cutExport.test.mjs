import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cutPlan, mapClicks} from '../src/cutExport.mjs';

const close = (a, b) => Math.abs(a - b) < 1e-9;

test('video/both deletions are cut from the trimmed timeline; audio-only ones become output mutes', () => {
  // Recording 0–10 s, trimmed to 2–10 (8 s). Delete 4–5 (both) and 7–8 (video); mute 8.5–9 (audio).
  const plan = cutPlan([{start: 4, end: 5, target: 'both'}, {start: 7, end: 8, target: 'video'}, {start: 8.5, end: 9, target: 'audio'}], 2, 8);
  assert.deepEqual(plan.segments.map(s => [s.start, s.end, s.out]), [[0, 2, 0], [3, 5, 2], [6, 8, 4]]);
  assert.equal(plan.outDuration, 6);
  assert.ok(close(plan.toTrimmed(1.5), 1.5));
  assert.ok(close(plan.toTrimmed(2), 3), 'output 2 s continues right after the first cut');
  assert.ok(close(plan.toTrimmed(4.25), 6.25));
  assert.equal(plan.toOutput(2.5), null, 'inside a cut');
  assert.ok(close(plan.toOutput(6.5), 4.5));
  assert.deepEqual(plan.mutes, [{start: 4.5, end: 5}]);
  const clicks = mapClicks([0.5, 2.5, 3.5, 6.1], plan); // 2.5 is inside the first cut and is dropped
  assert.equal(clicks.length, 3);
  [0.5, 2.5, 4.1].forEach((v, i) => assert.ok(close(clicks[i], v)));
});

test('overlapping and out-of-trim deletions merge and clip; no deletions keeps one segment', () => {
  const plan = cutPlan([{start: 0, end: 3, target: 'both'}, {start: 2, end: 4, target: 'video'}, {start: 20, end: 30, target: 'both'}], 1, 9);
  assert.deepEqual(plan.segments.map(s => [s.start, s.end]), [[3, 9]]);
  assert.equal(plan.outDuration, 6);
  const none = cutPlan([], 0, 5);
  assert.equal(none.hasCuts, false);
  assert.deepEqual(none.segments.map(s => [s.start, s.end, s.out]), [[0, 5, 0]]);
  assert.equal(cutPlan([{start: 0, end: 5, target: 'both'}], 0, 5).outDuration, 0);
});
