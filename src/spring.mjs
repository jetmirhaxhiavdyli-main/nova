// Exact critically damped spring step, independent of drawing frame rate.
export function springStep(value, velocity, target, seconds, frequency) {
  const dt = Math.max(0, seconds), offset = value - target;
  const c = velocity + frequency * offset, decay = Math.exp(-frequency * dt);
  const next = target + (offset + c * dt) * decay;
  const speed = (velocity - frequency * c * dt) * decay;
  return Math.abs(next - target) < 0.00001 && Math.abs(speed) < 0.0001 ? [target, 0] : [next, speed];
}
