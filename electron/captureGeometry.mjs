// Overlay CSS coordinates -> full-resolution capture pixels, shared by both capture paths.
export function cropPixels(area, geometry, viewport, video) {
  const { displayBounds: display, overlayBounds: overlay } = geometry;
  const values = [area.x, area.y, area.width, area.height, display.x, display.y, display.width, display.height, overlay.x, overlay.y, overlay.width, overlay.height, viewport.width, viewport.height, video.width, video.height];
  if (!values.every(Number.isFinite) || [area.width, area.height, display.width, display.height, overlay.width, overlay.height, viewport.width, viewport.height, video.width, video.height].some(value => value <= 0)) throw new Error('Invalid recording area.');
  const x = (overlay.x - display.x + area.x * overlay.width / viewport.width) * video.width / display.width;
  const y = (overlay.y - display.y + area.y * overlay.height / viewport.height) * video.height / display.height;
  const width = area.width * overlay.width / viewport.width * video.width / display.width;
  const height = area.height * overlay.height / viewport.height * video.height / display.height;
  const left = Math.max(0, Math.round(x)), top = Math.max(0, Math.round(y));
  const right = Math.min(video.width, Math.round(x + width)), bottom = Math.min(video.height, Math.round(y + height));
  if (right - left < 2 || bottom - top < 2) throw new Error('Move the recording area onto your display.');
  return { x: left, y: top, width: right - left, height: bottom - top };
}
