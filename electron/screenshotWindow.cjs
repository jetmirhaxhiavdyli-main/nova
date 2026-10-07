/**
 * The one window behind both screenshot steps: a transparent selection overlay, then (resized) the preview card.
 * Created ahead of time and only hidden afterwards, so the hotkey shows the dim instantly instead of waiting for a
 * window and the app to load. `send` events go to src/components/ScreenshotSelect.jsx.
 */
function createShotWindow({ BrowserWindow, preload, icon, load }) {
  let win = null, ready = null, markReady = () => {};
  const alive = () => win && !win.isDestroyed();
  function ensure() {
    if (alive()) return ready;
    ready = new Promise(resolve => { markReady = resolve; });
    win = new BrowserWindow({ show: false, frame: false, transparent: true, backgroundColor: '#00000000', skipTaskbar: true, alwaysOnTop: true, hasShadow: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false, title: 'Nova screenshot', icon, webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.setMenu(null);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('closed', () => { win = null; ready = null; });
    load(win);
    return ready;
  }
  const send = event => { if (alive()) win.webContents.send('screenshot-event', event); };
  return {
    warm: ensure,
    /** Called by the page once its listeners exist (a load event alone can come too early for the first message). */
    mounted: () => markReady(),
    owns: sender => alive() && win.webContents === sender,
    get window() { return alive() ? win : null; },
    async arm(display) {
      await ensure();
      win.setContentProtection(true); // the dim must not appear in the grab
      win.setAlwaysOnTop(true, 'screen-saver');
      win.setBounds(display.bounds); win.setBounds(display.bounds); // twice: Windows can apply the first one at the old display's scale
      send({ type: 'arm' });
      win.show(); win.focus();
    },
    frame: ({ bytes, width, height }) => send({ type: 'frame', bytes, width, height }),
    preview({ display, bytes, width, height }) {
      if (!alive()) return;
      const area = display.workArea, scale = display.scaleFactor || 1;
      // Card = image (device px -> CSS px, capped) + header and button bar + a margin for the shadow.
      const w = Math.min(Math.round(area.width * 0.8), Math.max(460, Math.round(width / scale) + 64));
      const h = Math.min(Math.round(area.height * 0.85), Math.max(300, Math.round(height / scale) + 64 + 76));
      win.setContentProtection(false);
      win.setAlwaysOnTop(true, 'floating');
      const bounds = { x: area.x + Math.round((area.width - w) / 2), y: area.y + Math.round((area.height - h) / 2), width: w, height: h };
      win.setBounds(bounds); win.setBounds(bounds);
      send({ type: 'preview', bytes, width, height });
      win.show(); win.focus();
    },
    /** Same card, new picture (after a crop); no resize so the window doesn't jump. */
    update: ({ bytes, width, height, edited }) => send({ type: 'update', bytes, width, height, edited }),
    hide() { if (alive()) { send({ type: 'reset' }); win.hide(); } },
  };
}
module.exports = { createShotWindow };
