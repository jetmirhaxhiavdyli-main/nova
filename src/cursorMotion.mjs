import { springStep } from './spring.mjs';
// A deliberate demo pace: ~0.47s to cover 95% of a pointer move.
export const CURSOR_SPRING = 10;
export function createCursorMotion() {
  let current = null, target = null, velocity = { x: 0, y: 0 }, last = null;
  return {
    move(point, now) {
      if (!point || point.visible === false) { current = null; target = null; last = now; return; }
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      target = { x: point.x, y: point.y };
      if (!current) { current = { ...target }; velocity = { x: 0, y: 0 }; last = now; }
    },
    frame(now) {
      if (!current) return null;
      // Catch up on deliberate travel while retaining gentle filtering for jitter.
      const distance=Math.hypot(target.x-current.x,target.y-current.y);
      const blend=Math.min(1,distance/.2);
      const frequency=CURSOR_SPRING*(1+1.2*blend*blend*(3-2*blend));
      for (const key of ['x','y']) [current[key], velocity[key]] = springStep(current[key], velocity[key], target[key], Math.max(0, now - last) / 1000, frequency);
      last = now;
      return { ...current };
    },
  };
}
export function drawCursor(context, x, y, size) {
  context.save(); context.translate(x, y); context.scale(size / 24, size / 24);
  context.beginPath(); context.moveTo(0, 0); context.lineTo(0, 22); context.lineTo(5.5, 16.5);
  context.lineTo(10, 26); context.lineTo(14, 24); context.lineTo(9.5, 15);
  context.lineTo(17, 15); context.closePath();
  context.lineJoin = 'round'; context.lineWidth = 2;
  context.strokeStyle = '#ffffff'; context.fillStyle = '#111111';
  context.stroke(); context.fill(); context.restore();
}
