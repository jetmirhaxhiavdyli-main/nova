import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropPixels } from '../src/areaCapture.mjs';
const displayBounds = { x: -1920, y: 0, width: 1920, height: 1080 };
const geometry = { displayBounds, overlayBounds: { x: -1920, y: 40, width: 1920, height: 1040 } };
const viewport = { width: 1920, height: 1040 };
test('maps a moved selection with display origin, work-area offset and 150% scaling', () => {
  assert.deepEqual(cropPixels({ x: 100, y: 60, width: 400, height: 200 }, geometry, viewport, { width: 2880, height: 1620 }), { x: 150, y: 150, width: 600, height: 300 });
});
test('uses real capture dimensions when the source is downscaled', () => {
  assert.deepEqual(cropPixels({ x: 100, y: 60, width: 400, height: 200 }, geometry, viewport, { width: 960, height: 540 }), { x: 50, y: 50, width: 200, height: 100 });
});
test('clips partially off-screen areas and rejects fully off-screen areas', () => {
  const video = { width: 1920, height: 1080 };
  assert.deepEqual(cropPixels({ x: -50, y: 0, width: 200, height: 100 }, geometry, viewport, video), { x: 0, y: 40, width: 150, height: 100 });
  assert.throws(() => cropPixels({ x: 2000, y: 0, width: 200, height: 100 }, geometry, viewport, video), /onto your display/);
});
