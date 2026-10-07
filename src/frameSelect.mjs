/**
 * Which source frame to show for an output frame. `times` are the recording's real frame times (uneven for a screen
 * recording). The output frame covers [i/fps, (i+1)/fps); the frame to show is the latest one on screen by its middle.
 * Returns an index into `times`, never before the first frame.
 */
export function pickFrame(times, t, fps) {
  const target = t + 0.5 / fps;
  let low = 0, high = times.length - 1, found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (times[mid] <= target) { found = mid; low = mid + 1; } else high = mid - 1;
  }
  return found;
}
