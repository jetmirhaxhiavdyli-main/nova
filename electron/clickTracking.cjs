// Tracks motion and activity only while recording. Typing reports carry no key
// codes or text: they only keep the current zoom framed during an interaction.
function createClickTracking({ screen, systemPreferences, desktopCapturer, canSend, send, sendMove = () => {}, sendActivity = () => {} }) {
  let hook, listener, keyListener, wheelListener, timer, generation = 0;
  function stop() {
    generation++;
    clearInterval(timer); timer = null;
    if (listener) {
      hook.removeListener('mousedown', listener);
      hook.removeListener('keydown', keyListener);
      hook.removeListener('wheel', wheelListener);
      hook.stop(); listener = null; keyListener = null; wheelListener = null;
    }
  }
  async function start(sourceId) {
    stop();
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      throw new Error('Auto-zoom needs Accessibility permission for Nova in System Settings. Enable it and restart, or turn Auto-zoom off.');
    }
    const token = generation;
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    const source = sources.find(s => s.id === sourceId);
    if (!source) throw new Error('The recording source is no longer available.');
    const isScreen = sourceId.startsWith('screen:');
    const display = isScreen && require('./displayMatch.cjs').displayForSource(screen.getAllDisplays(), source, sources);
    if (isScreen && !display) throw new Error('Could not locate the display for auto-zoom.');
    const native = !isScreen ? await import('@screen-capture/node') : null;
    // A timed-out start may finish after stop() or a newer recording has started.
    if(token!==generation)return;
    hook = require('uiohook-napi').uIOhook;
    // Window recordings use the recorded window's own rect, focused or not: requiring it to be the active
    // window hid the cursor whenever it wasn't focused, so it only appeared after a click (fixed 2026-09-27).
    const handle = !isScreen ? Number(sourceId.split(':')[1]) : null;
    let cachedRect = null, boundsAt = 0;
    async function locate(point, fresh = false) {
      let bounds;
      if (isScreen) {
        bounds = screen.getAllDisplays().find(d => d.id === display.id)?.bounds;
        if (process.platform === 'win32') point = screen.screenToDipPoint(point);
      } else {
        if (fresh || !cachedRect || Date.now() - boundsAt > 80) { cachedRect = native.windowFromHandle(handle)?.rect || null; boundsAt = Date.now(); }
        const rect = cachedRect;
        if (!rect) return null;
        bounds = {x:rect.left,y:rect.top,width:rect.right-rect.left,height:rect.bottom-rect.top};
      }
      if (!bounds?.width || !bounds?.height) return null;
      const x = (point.x - bounds.x) / bounds.width, y = (point.y - bounds.y) / bounds.height;
      return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? {x,y,visible:true} : null;
    }
    listener = async event => {
      if (!canSend() || event.button !== 1) return;
      try {
        const point = await locate({ x: event.x, y: event.y }, true);
        if (token === generation && canSend() && point) send(point);
      } catch { /* A closed or inaccessible window must not stop a recording. */ }
    };
    let activityPending = false, lastActivity = -Infinity;
    async function reportActivity(kind, event) {
      if (!canSend() || activityPending || Date.now() - lastActivity < 200) return;
      activityPending = true; lastActivity = Date.now();
      try {
        let point = event ? {x:event.x,y:event.y} : screen.getCursorScreenPoint();
        if (!event && process.platform === 'win32') point = screen.dipToScreenPoint(point);
        point = await locate(point, true);
        if (token === generation && canSend() && point) sendActivity({kind,x:point.x,y:point.y});
      } catch { /* A disappearing source must not break recording. */ }
      finally { activityPending = false; }
    }
    keyListener = () => { void reportActivity('typing'); };
    wheelListener = event => { void reportActivity('scroll', event); };
    hook.on('mousedown', listener); hook.on('keydown', keyListener); hook.on('wheel', wheelListener);
    try { hook.start(); } catch (error) { stop(); throw error; }
    let polling = false;
    timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        let point = null;
        if (canSend()) {
          let screenPoint = screen.getCursorScreenPoint();
          if (process.platform === 'win32') screenPoint = screen.dipToScreenPoint(screenPoint);
          point = await locate(screenPoint);
        }
        if (token === generation) sendMove(point || { visible: false });
      } catch { if (token === generation) sendMove({visible:false}); }
      finally { polling = false; }
    }, 16);
  }
  return { start, stop };
}
module.exports = { createClickTracking };



