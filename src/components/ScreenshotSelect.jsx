import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import Icon from './Icon';
import AreaSelection from './AreaSelection';

const MIN = 4, CROP_MIN = 24;
const box = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) });
const png = bytes => URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
const jpeg = bytes => URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));

/**
 * Screenshot window (loaded with `?screenshot=1`, kept hidden and reused). The main process drives it:
 *   arm     -> dim the live screen at once (the window is excluded from the capture)
 *   frame   -> the frozen picture arrives; drag a rectangle (Esc / right-click cancels)
 *   preview -> the copied area with Crop / Save / Copy; `update` swaps in a cropped picture
 */
export default function ScreenshotSelect() {
  const bridge = window.recorder;
  const [mode, setMode] = useState('idle'), [frame, setFrame] = useState(null), [rect, setRect] = useState(null);
  const [shot, setShot] = useState(null), [status, setStatus] = useState(''), [copied, setCopied] = useState(false);
  const [crop, setCrop] = useState(null), [edited, setEdited] = useState(false); // crop: { box: displayed image rect, rect: selection } while cropping
  const origin = useRef(null), urls = useRef([]), timer = useRef(0), imageRef = useRef(null), holderRef = useRef(null), cropping = useRef(false);
  cropping.current = !!crop;
  const track = url => { urls.current.push(url); return url; };
  const release = () => { urls.current.forEach(URL.revokeObjectURL); urls.current = []; };
  const flash = () => { setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000); };
  const clear = () => { release(); origin.current = null; clearTimeout(timer.current); setFrame(null); setRect(null); setShot(null); setCrop(null); setEdited(false); setCopied(false); setStatus(''); };

  useEffect(() => {
    const off = bridge.onScreenshot(event => {
      if (event.type === 'arm') { clear(); setMode('select'); }
      else if (event.type === 'frame') setFrame(track(jpeg(event.bytes)));
      else if (event.type === 'preview') { clear(); setShot({ url: track(png(event.bytes)), width: event.width, height: event.height }); setStatus('Copied to clipboard'); setMode('preview'); }
      else if (event.type === 'update') { release(); setShot({ url: track(png(event.bytes)), width: event.width, height: event.height }); setEdited(!!event.edited); }
      else if (event.type === 'reset') { clear(); setMode('idle'); }
    });
    return () => { off(); release(); clearTimeout(timer.current); };
  }, [bridge]);
  useEffect(() => {
    // Esc backs out one step: crop first, then the preview / selection.
    const key = event => { if (event.key !== 'Escape') return; if (cropping.current) setCrop(null); else bridge.screenshotCancel(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [bridge]);

  function down(event) {
    if (event.button !== 0) { bridge.screenshotCancel(); return; }
    if (!frame) return; // the picture is still being grabbed
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY };
    setRect(box(origin.current, origin.current));
  }
  const move = event => { if (origin.current) setRect(box(origin.current, { x: event.clientX, y: event.clientY })); };
  function up(event) {
    if (!origin.current) return;
    const area = box(origin.current, { x: event.clientX, y: event.clientY });
    origin.current = null;
    if (area.width < MIN || area.height < MIN) { setRect(null); return; }
    setRect(area);
    bridge.screenshotDone(area, { width: window.innerWidth, height: window.innerHeight }).then(result => { if (!result) bridge.screenshotCancel(); }).catch(() => bridge.screenshotCancel());
  }

  const copy = () => bridge.screenshotCopy().then(ok => { if (ok) { flash(); setStatus('Copied to clipboard'); } else setStatus('Could not copy'); }).catch(() => setStatus('Could not copy'));
  const save = () => bridge.screenshotSave().then(path => { if (path) setStatus(`Saved ${path.split(/[\\/]/).pop()}`); }).catch(() => setStatus('Could not save'));
  function startCrop() {
    const image = imageRef.current.getBoundingClientRect(), holder = holderRef.current.getBoundingClientRect();
    const b = { left: image.left - holder.left, top: image.top - holder.top, width: image.width, height: image.height };
    setCrop({ box: b, rect: { x: b.width * 0.1, y: b.height * 0.1, width: b.width * 0.8, height: b.height * 0.8 } });
  }
  // Keep the selection inside the image, in displayed px.
  const moveCrop = next => setCrop(c => {
    const width = Math.min(c.box.width, Math.max(CROP_MIN, next.width)), height = Math.min(c.box.height, Math.max(CROP_MIN, next.height));
    return { ...c, rect: { width, height, x: Math.min(c.box.width - width, Math.max(0, next.x)), y: Math.min(c.box.height - height, Math.max(0, next.y)) } };
  });
  function applyCrop() {
    const k = shot.width / crop.box.width, r = crop.rect;
    const x = Math.min(shot.width - 2, Math.max(0, Math.round(r.x * k))), y = Math.min(shot.height - 2, Math.max(0, Math.round(r.y * k)));
    const area = { x, y, width: Math.max(2, Math.min(shot.width - x, Math.round(r.width * k))), height: Math.max(2, Math.min(shot.height - y, Math.round(r.height * k))) };
    bridge.screenshotCrop(area).then(result => { if (result) { setCrop(null); flash(); setStatus('Cropped · copied to clipboard'); } else setStatus('Could not crop'); }).catch(() => setStatus('Could not crop'));
  }
  const reset = () => bridge.screenshotCrop(null).then(result => { if (result) { flash(); setStatus('Original restored · copied to clipboard'); } }).catch(() => setStatus('Could not reset'));

  if (mode === 'preview' && shot) return (
    <div className="snap" role="dialog" aria-label="Screenshot preview">
      <div className="snap__bar snap__bar--top">
        <strong>Screenshot</strong><span className="snap__size">{shot.width} × {shot.height}</span>
        <Button isIconOnly variant="ghost" size="sm" className="snap__close" aria-label="Close preview" onPress={() => bridge.screenshotCancel()}><Icon name="close" size={12} /></Button>
      </div>
      <div className="snap__image" ref={holderRef}>
        <img ref={imageRef} src={shot.url} alt="Screenshot" draggable={false} />
        {crop && (
          <div className="snap__crop" style={{ left: crop.box.left, top: crop.box.top, width: crop.box.width, height: crop.box.height }}>
            <div className="snap__cropclip"><div className="snap__cropdim" style={{ left: crop.rect.x, top: crop.rect.y, width: crop.rect.width, height: crop.rect.height }} /></div>
            <AreaSelection rect={crop.rect} onChange={moveCrop} scale={shot.width / crop.box.width} min={CROP_MIN} />
          </div>
        )}
      </div>
      <div className="snap__bar">
        <span className="snap__status" role="status">{crop ? 'Drag the box or its corners to choose what to keep' : status}</span>
        {crop ? <>
          <Button variant="secondary" onPress={() => setCrop(null)}>Cancel</Button>
          <Button onPress={applyCrop}><Icon name="check" size={16} />Apply crop</Button>
        </> : <>
          {edited && <Button variant="ghost" onPress={reset}>Reset</Button>}
          <Button variant="secondary" onPress={startCrop}><Icon name="crop" size={16} />Crop</Button>
          <Button variant="secondary" onPress={save}><Icon name="floppy-disk" size={16} />Save</Button>
          <Button className="snap__copy" data-copied={copied || undefined} onPress={copy}>{copied ? <><Icon name="check" size={16} />Copied</> : 'Copy'}</Button>
        </>}
      </div>
    </div>
  );
  if (mode !== 'select') return null;
  return (
    <div className="shot" onPointerDown={down} onPointerMove={move} onPointerUp={up} onContextMenu={event => { event.preventDefault(); bridge.screenshotCancel(); }}>
      {frame && <img src={frame} alt="" draggable={false} />}
      {rect ? <>
        <div className="shot__sel" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} />
        <span className="shot__size" style={{ left: rect.x, top: Math.max(0, rect.y - 28) }}>{rect.width} × {rect.height}</span>
      </> : <>
        <div className="shot__dim" />
        <span className="shot__hint">Drag to select an area · Esc to cancel</span>
      </>}
    </div>
  );
}
