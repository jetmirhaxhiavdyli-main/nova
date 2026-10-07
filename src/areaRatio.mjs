/**
 * Area size (screen px) after the user edits one dimension with the aspect ratio locked: the other dimension
 * follows, then the result is shrunk to fit the screen and grown to the minimum without changing the ratio.
 * `changed` is 'width' or 'height'; without a ratio the size is returned as given.
 */
export function lockedSize(size, changed, ratio, max, min = 120) {
  let { width, height } = size;
  if (!(ratio > 0)) return { width, height };
  if (changed === 'height') width = height * ratio; else height = width / ratio;
  const grow = Math.max(1, min / width, min / height);
  width *= grow; height *= grow;
  const shrink = Math.min(1, max.width / width, max.height / height);
  return { width: Math.round(width * shrink), height: Math.round(height * shrink) };
}

const COMMON = [[16, 9], [4, 3], [1, 1], [3, 2], [21, 9], [16, 10], [9, 16], [3, 4]];
/** "16:9" for familiar shapes, otherwise "1.37:1". */
export function ratioText(ratio) {
  const match = COMMON.find(([w, h]) => Math.abs(ratio - w / h) < 0.01);
  return match ? `${match[0]}:${match[1]}` : `${ratio.toFixed(2)}:1`;
}
