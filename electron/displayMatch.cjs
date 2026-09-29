// Finds the Electron display for a desktopCapturer screen source.
// Some PCs report a display_id that matches no Electron display id (empty or a different number),
// which made Display/Area recording fail to start while Window recording worked. Fallbacks, in order:
// exact id → the only display → same position when both lists have the same length.
function displayForSource(displays, source, screenSources) {
  if (!source || !Array.isArray(displays) || !displays.length) return null;
  const exact = source.display_id && displays.find(d => String(d.id) === String(source.display_id));
  if (exact) return exact;
  if (displays.length === 1) return displays[0];
  const screens = (screenSources || []).filter(s => String(s.id).startsWith('screen:'));
  const index = screens.findIndex(s => s.id === source.id);
  if (index >= 0 && screens.length === displays.length) return displays[index];
  return null;
}
module.exports = { displayForSource };
