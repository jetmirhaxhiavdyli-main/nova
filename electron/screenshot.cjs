const { displayForSource } = require('./displayMatch.cjs');

/**
 * Screenshot of one area. The selection window dims the screen at once (it is excluded from capture), the display
 * under the cursor is grabbed meanwhile, then the frozen picture appears and the user drags a rectangle. The area is
 * copied to the clipboard and shown in a preview with Copy / Save. Everything Electron-specific is injected:
 *   win       { arm(display), frame({bytes,width,height}), preview({display,bytes,width,height}), hide() }
 *   clipboard { writeImage(image) }   save(png) -> path | null   prepare()/release() hide Nova's own overlay for the grab
 */
function createScreenshot({ desktopCapturer, screen, clipboard, win, save, prepare = async () => {}, release = () => {}, canStart = () => true, log = () => {} }) {
  let session = null; // { stage: 'starting' | 'select' | 'preview', display, image, cropped, png }
  const end = () => { session = null; win.hide(); };
  async function grab(display) {
    const size = { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) };
    try {
      await prepare();
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      const displays = screen.getAllDisplays();
      return sources.find(s => displayForSource(displays, s, sources)?.id === display.id)?.thumbnail;
    } catch (error) { log(`screenshot grab failed: ${error?.message || error}`); return null; }
    finally { release(); }
  }
  return {
    owns: sender => win.owns(sender),
    async start() {
      if (session && session.stage !== 'preview') return false; // already selecting
      if (!canStart()) return false;
      if (session) end(); // a new shortcut press replaces an open preview
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const mine = session = { stage: 'starting', display };
      // The dim appears immediately; the grab runs alongside it.
      const [image] = await Promise.all([grab(display), win.arm(display)]);
      if (session !== mine) return false; // cancelled while grabbing
      if (!image || image.isEmpty()) { end(); return false; }
      mine.image = image; mine.stage = 'select';
      win.frame({ bytes: image.toJPEG(90), width: display.bounds.width, height: display.bounds.height }); // display copy only; the crop uses the lossless image
      return true;
    },
    /** `rect` and `viewport` are CSS px of the selection window. Returns the copied size, or null (cancelled/too small). */
    async finish(rect, viewport) {
      const current = session;
      if (current?.stage !== 'select') return null;
      try {
        const { cropPixels } = await import('./captureGeometry.mjs');
        const { display, image } = current;
        const crop = cropPixels(rect, { displayBounds: display.bounds, overlayBounds: display.bounds }, viewport, image.getSize());
        const cropped = image.crop(crop), png = cropped.toPNG();
        await clipboard.writeImage(cropped);
        Object.assign(current, { stage: 'preview', image: null, original: cropped, cropped, png });
        win.preview({ display, bytes: png, width: crop.width, height: crop.height });
        return { width: crop.width, height: crop.height };
      } catch (error) {
        log(`screenshot not copied: ${error?.message || error}`);
        end();
        return null;
      }
    },
    async copy() {
      if (session?.stage !== 'preview') return false;
      await clipboard.writeImage(session.cropped);
      return true;
    },
    /** Crops the previewed image further (`rect` in its own pixels), or restores the first selection when `rect` is null. Copies the result. */
    async crop(rect) {
      const current = session;
      if (current?.stage !== 'preview') return null;
      try {
        let next = current.original;
        if (rect) {
          const { width, height } = current.cropped.getSize();
          const { x, y, width: w, height: h } = rect;
          if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 2 || h < 2 || x + w > width || y + h > height) throw new Error('Invalid crop.');
          next = current.cropped.crop({ x, y, width: w, height: h });
        }
        const png = next.toPNG();
        await clipboard.writeImage(next);
        Object.assign(current, { cropped: next, png });
        const size = next.getSize();
        win.update({ bytes: png, width: size.width, height: size.height, edited: next !== current.original });
        return { width: size.width, height: size.height };
      } catch (error) { log(`screenshot crop failed: ${error?.message || error}`); return null; }
    },
    async save() { return session?.stage === 'preview' ? save(session.png) : null; },
    cancel: end,
  };
}
module.exports = { createScreenshot };
