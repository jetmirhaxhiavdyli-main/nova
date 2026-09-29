import React, { useEffect, useRef, useState } from 'react';
import {createCameraSync} from '../../syncRecordedCamera.mjs';
import { animatedBackground, animatedBackgroundProgress, animatedCss, CAMERA_SIZE, IMAGE_FILL, backgroundKind, blurredImageRect, cameraRect, clamp, gradientCss, imageBlurPx, imageRect, imageSrc, presetGradient } from './constants';

const PANEL_EDGE = 332; // preview moves right of an open panel (x ≥ 332)
const SCENE_BAR_BOTTOM = 72; // scene bar top 12 + 48 + gap 12
const MARGIN = 20;
const SAMPLE_W = 960, SAMPLE_H = 540;

/** Where the output canvas sits inside the stage (aspect-fit with a 20px margin), always below the scene bar. */
function fitCanvas(stage, output, panelOpen) {
  const x = panelOpen ? PANEL_EDGE : 12, y = SCENE_BAR_BOTTOM;
  const boxW = Math.max(0, stage.width - 12 - x) - MARGIN * 2, boxH = Math.max(0, stage.height - 12 - y) - MARGIN * 2;
  const ratio = output.width / output.height;
  let width = boxW, height = width / ratio;
  if (height > boxH) { height = boxH; width = height * ratio; }
  width = Math.max(0, Math.round(width)); height = Math.max(0, Math.round(height));
  return { left: Math.round(x + MARGIN + (boxW - width) / 2), top: Math.round(y + MARGIN + (boxH - height) / 2), width, height };
}

/** Stand-in for a recording in browser previews: a light dashboard. */
function SampleScreen() {
  const bar = (left, top, width, height, background, radius = 4) => <div style={{ position: 'absolute', left, top, width, height, borderRadius: radius, background }} />;
  const card = left => (
    <div style={{ position: 'absolute', left, top: 74, width: 232, height: 96, boxSizing: 'border-box', borderRadius: 12, background: '#fff', border: '1px solid #ececef', padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 17 }}>
      <div style={{ width: 90, height: 7, borderRadius: 4, background: '#c4c4cc' }} /><div style={{ width: 110, height: 18, borderRadius: 5, background: '#27272a' }} />
    </div>
  );
  return <>
    {bar(0, 0, 164, SAMPLE_H, '#f0f0f2', 0)}
    {bar(20, 22, 22, 22, '#18181b', 6)}{bar(52, 29, 70, 8, '#a1a1aa')}{bar(16, 72, 132, 30, '#e0e0e4', 8)}
    {[122, 150, 178, 206].map((top, i) => <React.Fragment key={top}>{bar(28, top, [84, 66, 76, 58][i], 7, '#c4c4cc')}</React.Fragment>)}
    {bar(196, 26, 180, 14, '#27272a', 5)}{bar(780, 22, 96, 24, '#18181b', 7)}{bar(888, 22, 24, 24, '#d4d4d8', 12)}
    {card(196)}{card(444)}{card(692)}
    <div style={{ position: 'absolute', left: 196, top: 190, width: 728, height: 318, boxSizing: 'border-box', borderRadius: 12, background: '#fff', border: '1px solid #ececef' }} />
    {bar(216, 212, 130, 9, '#a1a1aa')}
    <svg width="700" height="210" viewBox="0 0 700 210" style={{ position: 'absolute', left: 216, top: 256 }} aria-hidden="true">
      <path d="M0 204 L70 180 L140 188 L210 144 L280 154 L350 108 L420 120 L490 74 L560 86 L630 38 L690 48" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  </>;
}

/** Cursor glyphs; the hotspot is the element's origin. Also used for the style tiles in the Video panel. */
export function CursorGlyph({ style }) {
  if (style === 'touch') return <span className="preview-cursor__touch" />;
  return (
    <svg width="15" height="21" viewBox="-1 -1 15 21" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M0 0 L0 16 L4.2 12.2 L7 18.5 L9.6 17.4 L6.9 11.2 L12.5 11.2 Z" fill="#111113" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Webcam overlay (edits.camera): outside the zoomed scene so it stays put. Press to select (opens the Camera panel)
 * and drag to move; the top-left corner handle resizes it with the bottom-right corner fixed; arrows nudge.
 * Plays `url` (the recorded camera, TODO(codex)) in sync with the screen; without it a silhouette stands in.
 */
function WebcamOverlay({ canvas, webcam, url, time, playing, selected, onSelect, onChange }) {
  const videoEl = useRef(null), drag = useRef(null);
  const sync=useRef(null);
  const playback=useRef({time,playing});playback.current={time,playing};
  const [active, setActive] = useState(false);
  const r = cameraRect(canvas.width, canvas.height, webcam), short = Math.min(canvas.width, canvas.height) || 1;
  useEffect(()=>{
    const v=videoEl.current;if(!v)return;
    sync.current={video:v,update:createCameraSync(v)};
    const update=()=>sync.current?.update(playback.current.time,playback.current.playing);
    v.addEventListener('loadedmetadata',update);v.addEventListener('seeked',update);
    update();
    return()=>{v.removeEventListener('loadedmetadata',update);v.removeEventListener('seeked',update);v.pause();sync.current=null;};
  },[url]);
  useEffect(() => {
    const v = videoEl.current; if (!v) return;
    if(sync.current?.video!==v)sync.current={video:v,update:createCameraSync(v)};
    sync.current.update(time,playing);
  }, [time, playing,url]);
  const toCentre = (x, y) => ({ x: +(x / (canvas.width || 1)).toFixed(4), y: +(y / (canvas.height || 1)).toFixed(4) });
  function down(e, mode) {
    if (e.button !== 0) return;
    e.stopPropagation(); window.getSelection()?.removeAllRanges();
    if (!selected) onSelect?.();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    drag.current = { mode, x0: e.clientX, y0: e.clientY, r, key: `drag:webcam-${mode}-${e.timeStamp}` };
    setActive(true);
  }
  function move(e) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (d.mode === 'move') { onChange(toCentre(d.r.x + d.r.width / 2 + dx, d.r.y + d.r.height / 2 + dy), d.key); return; }
    // Resize from the top-left handle: grow as it moves up/left, keeping the bottom-right corner in place.
    const aspect = d.r.width / d.r.height, height = Math.max(8, d.r.height - (dy + dx / aspect) / 2);
    const size = clamp(height / short, CAMERA_SIZE.min, CAMERA_SIZE.max), h = size * short, w = h * aspect;
    onChange({ size: +size.toFixed(4), ...toCentre(d.r.x + d.r.width - w / 2, d.r.y + d.r.height - h / 2) }, d.key);
  }
  function up() { drag.current = null; setActive(false); }
  function key(e) {
    const step = (e.shiftKey ? 0.05 : 0.01), delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta) return;
    e.preventDefault(); e.stopPropagation();
    onChange(toCentre(r.x + r.width / 2 + delta[0] * canvas.width, r.y + r.height / 2 + delta[1] * canvas.height), 'webcam.nudge');
  }
  return (
    <div className="preview-webcam" data-selected={selected || undefined} data-dragging={active || undefined} data-shape={webcam.shape}
      style={{ left: r.x, top: r.y, width: r.width, height: r.height, borderRadius: r.radius }}
      role="button" tabIndex={0} aria-pressed={selected} aria-label="Camera. Drag or use arrow keys to move it; drag the corner handle to resize. Press Enter for camera settings."
      onPointerDown={e => down(e, 'move')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
      onClick={e => { if (e.detail === 0) onSelect?.(); }}>
      <span className="preview-webcam__media" style={{ borderRadius: r.radius, transform: webcam.mirror ? 'scaleX(-1)' : undefined }}>
        {url
          ? <video ref={videoEl} src={url} muted playsInline preload="auto" />
          : <span className="camera__placeholder" aria-hidden="true"><span className="camera__head" /><span className="camera__body" /></span>}
      </span>
      {selected && <span className="preview-webcam__resize" aria-hidden="true" onPointerDown={e => down(e, 'resize')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />}
    </div>
  );
}

/**
 * Composed preview: background → padded video (radius, shadow) → cursor, all scaled by the active zoom.
 * With `url` it plays the real recording; without it (browser preview) it shows a sample screen.
 */
export default function PreviewCanvas({ stage, panelOpen, output, source, url, videoRef, onVideoSize, onDuration, video, background, cursorSettings, playing, cursor, time, clicks, zoom, camera, windowCapture = false,
  videoSelected = false, onSelectVideo, onMoveVideo, onDeselect, backgroundEditable = false, onMoveBackground, onSelectBackground,
  webcam = null, webcamUrl, webcamSelected = false, onSelectWebcam, onChangeWebcam }) {
  const canvas = fitCanvas(stage, output, panelOpen);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const hasBackground = background.mode !== 'none';
  const kind = background.mode === 'preset' ? backgroundKind(background) : null;
  const animated = kind === 'animated' ? animatedBackground(background.preset) : null;
  const image = kind === 'image' && background.image?.width ? background.image : null;
  const fill = animated ? animatedCss(animated) : image ? image.fill || IMAGE_FILL : background.mode === 'preset' ? gradientCss(presetGradient(background)) : background.mode === 'color' ? background.color : '#000';
  const imageBox = image && imageRect(canvas.width, canvas.height, image);
  const bgDrag = useRef(null);
  // The image can be grabbed any time; the first press also selects the background (opens its panel).
  const canDragImage = !!(imageBox && onMoveBackground);
  const imageSelected = canDragImage && backgroundEditable;
  function imageDown(e) {
    if (e.button !== 0 || e.target.closest('.preview__video')) return;
    // Any press on the background (outside the recording) selects it; only an image can also be dragged.
    if (hasBackground && onSelectBackground) { e.stopPropagation(); if (!backgroundEditable) onSelectBackground(); }
    if (!canDragImage) return;
    window.getSelection()?.removeAllRanges();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    bgDrag.current = { x0: e.clientX, y0: e.clientY, start: { x: image.x || 0, y: image.y || 0 } };
  }
  const moveImage = next => {
    const w = canvas.width || 1, h = canvas.height || 1;
    onMoveBackground({ x: +clamp(next.x, -imageBox.maxX / w, imageBox.maxX / w).toFixed(4), y: +clamp(next.y, -imageBox.maxY / h, imageBox.maxY / h).toFixed(4) });
  };
  function imageMove(e) {
    const d = bgDrag.current; if (!d) return;
    moveImage({ x: d.start.x + (e.clientX - d.x0) / (canvas.width || 1), y: d.start.y + (e.clientY - d.y0) / (canvas.height || 1) });
  }
  // Same keys as the recording: arrows nudge 1% (Shift 5%), double-click recentres.
  function imageKey(e) {
    if (!canDragImage || e.target !== e.currentTarget) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (delta) { e.preventDefault(); moveImage({ x: (image.x || 0) + delta[0], y: (image.y || 0) + delta[1] }); }
  }

  // The recording, fitted at its own aspect ratio inside the padding.
  const pad = hasBackground ? canvas.width * background.padding / 100 : 0;
  const innerW = Math.max(0, canvas.width - pad * 2), innerH = Math.max(0, canvas.height - pad * 2);
  const sourceRatio = source.width / source.height;
  const vw = Math.min(innerW, innerH * sourceRatio), vh = vw / sourceRatio;
  // Position: offset from centre as a fraction of the canvas, kept fully inside the canvas.
  const maxX = Math.max(0, (canvas.width - vw) / 2 / (canvas.width || 1)), maxY = Math.max(0, (canvas.height - vh) / 2 / (canvas.height || 1));
  const position = { x: clamp(video.position?.x || 0, -maxX, maxX), y: clamp(video.position?.y || 0, -maxY, maxY) };
  const vx = (canvas.width - vw) / 2 + position.x * canvas.width, vy = (canvas.height - vh) / 2 + position.y * canvas.height;
  const canMove = maxX > 0.0005 || maxY > 0.0005;
  const move = next => onMoveVideo?.({ x: +clamp(next.x, -maxX, maxX).toFixed(4), y: +clamp(next.y, -maxY, maxY).toFixed(4) });
  // Windows window captures may include a thin OS frame. Mask only presentation, never the source.
  const edge = windowCapture ? 2 * vw / source.width : 0;
  const radius = video.roundness * canvas.width / output.width;
  const s = video.shadow / 100, previewScale = canvas.width / output.width;
  const shadow = s > 0 ? `0 ${((4 + 18 * s) * previewScale).toFixed(1)}px ${((8 + 40 * s) * previewScale).toFixed(1)}px rgba(0,0,0,${(0.15 + 0.4 * s).toFixed(2)})` : 'none';

  // Cursor and zoom, in canvas pixels.
  const point = cursor && { x: vx + cursor.x * vw, y: vy + cursor.y * vh };
  const focus = zoom && (zoom.mode === 'auto' && point ? point : { x: vx + (zoom.focus?.x ?? 0.5) * vw, y: vy + (zoom.focus?.y ?? 0.5) * vh });
  const zoomMs = zoom?.instant ? 0 : 700;
  const sceneStyle = {
    transform: camera ? `translate(${-camera.x * vw / camera.width}px, ${-camera.y * vh / camera.height}px) scale(${1/camera.width})` : `scale(${zoom ? zoom.level : 1})`,
    transformOrigin: camera ? `${vx}px ${vy}px` : focus ? `${(focus.x / (canvas.width || 1) * 100).toFixed(2)}% ${(focus.y / (canvas.height || 1) * 100).toFixed(2)}%` : '50% 50%',
    transition: camera ? 'none' : `transform ${zoomMs}ms ease, transform-origin ${zoom?.mode === 'auto' && !zoom.instant ? 500 : zoomMs}ms ease`,
  };
  const moveS = camera ? 0 : playing ? 0.1 + cursorSettings.smoothness / 100 * 0.6 : 0.2;
  const glyphScale = (cursorSettings.style === 'large' ? 1.4 : 1) * (vw / SAMPLE_W * 1.3);
  const showCursor = point && !cursorSettings.hidden;
  const click = showCursor && clicks?.find(c => time >= c && time < c + 0.5);

  // Drag the recording against the background. A press without movement selects it (opens Video settings).
  const sceneScale = camera ? 1 / (camera.width || 1) : zoom ? zoom.level : 1;
  function handleDown(e) {
    if (e.button !== 0) return;
    window.getSelection()?.removeAllRanges();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    drag.current = { x0: e.clientX, y0: e.clientY, start: position, moved: false };
  }
  function handleMove(e) {
    const d = drag.current; if (!d || !canMove) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    move({ x: d.start.x + dx / sceneScale / canvas.width, y: d.start.y + dy / sceneScale / canvas.height });
  }
  function handleUp() {
    const d = drag.current; drag.current = null; setDragging(false);
    if (d && !d.moved) onSelectVideo?.();
  }
  function handleKey(e) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (delta && canMove) { e.preventDefault(); move({ x: position.x + delta[0], y: position.y + delta[1] }); }
  }

  return (
    <section className="preview" aria-label="Preview" onPointerDown={e => {
      if (e.button === 0 && !e.target.closest('.preview__video')) onDeselect?.();
    }}>
      <div className={`preview__canvas${animated ? ' bg-animated' : ''}`} data-bg-draggable={canDragImage || undefined}
        style={animated ? { ...canvas, backgroundImage: fill, animation: 'none', backgroundPosition: `${animatedBackgroundProgress(animated, time)*100}% 50%`, '--bg-seconds': `${animated.seconds}s` } : { ...canvas, background: fill }}
        onPointerDown={imageDown} onPointerMove={imageMove} onPointerUp={() => { bgDrag.current = null; }} onPointerCancel={() => { bgDrag.current = null; }}
        tabIndex={canDragImage ? 0 : undefined} role={canDragImage ? 'group' : undefined} onKeyDown={imageKey}
        aria-label={canDragImage ? 'Background image. Drag or use arrow keys to move it; double-click to centre.' : undefined}
        onDoubleClick={e => { if (canDragImage && !e.target.closest('.preview__video')) moveImage({ x: 0, y: 0 }); }}>
        {imageBox && (() => {
          const blur = imageBlurPx(canvas.width, canvas.height, image), r = blur ? blurredImageRect(canvas.width, canvas.height, image) : imageBox;
          return <img className="preview__bg-image" src={imageSrc(image)} alt="" draggable={false}
            style={{ left: r.x, top: r.y, width: r.width, height: r.height, filter: blur ? `blur(${blur.toFixed(2)}px)` : undefined }} />;
        })()}
        {/* Selected-image frame: the visible part of the image, outlined while it can be moved. */}
        {imageSelected && (() => {
          const l = Math.max(0, imageBox.x), t = Math.max(0, imageBox.y);
          const r = Math.min(canvas.width, imageBox.x + imageBox.width), b = Math.min(canvas.height, imageBox.y + imageBox.height);
          return <span className="preview__bg-frame" aria-hidden="true" data-cover={(l === 0 && t === 0 && r === canvas.width && b === canvas.height) || undefined} style={{ left: l, top: t, width: r - l, height: b - t }}><span className="preview__bg-label">Background image</span></span>;
        })()}
        <div className="preview__scene" style={sceneStyle}>
          <div className="preview__video" data-dragging={dragging || undefined} style={{ left: vx, top: vy, width: vw, height: vh, borderRadius: radius, boxShadow: shadow, background: url ? 'transparent' : undefined }}>
            {url
              ? <video style={{ clipPath: `inset(${edge}px round ${radius}px)` }} ref={videoRef} src={url} muted playsInline preload="auto"
                  onLoadedMetadata={e => onVideoSize?.({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })}
                  onDurationChange={e => { const d = e.currentTarget.duration; if (Number.isFinite(d)) onDuration?.(d); }} />
              : <div className="preview__sample" style={{ transform: `scale(${(vw / SAMPLE_W).toFixed(4)})` }}><SampleScreen /></div>}
            <button type="button" className="preview__handle" data-selected={videoSelected || undefined} data-movable={canMove || undefined} style={{ borderRadius: radius }}
              aria-label={canMove ? 'Recording. Drag or use arrow keys to move it; double-click to centre. Press Enter for video settings.' : 'Recording. Press Enter for video settings.'}
              aria-pressed={videoSelected}
              onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={() => { drag.current = null; setDragging(false); }}
              onKeyDown={handleKey} onDoubleClick={() => move({ x: 0, y: 0 })}
              onClick={e => { if (e.detail === 0) onSelectVideo?.(); /* keyboard Enter/Space */ }} />
          </div>
          {showCursor && click !== undefined && click !== false && <span key={click} className="preview-ripple" style={{ left: point.x - 14, top: point.y - 14 }} />}
          {showCursor && (
            <div className="preview-cursor" style={{ left: point.x, top: point.y, transform: `scale(${glyphScale.toFixed(3)})`, transitionDuration: `${moveS.toFixed(2)}s` }}>
              <CursorGlyph style={cursorSettings.style} />
            </div>
          )}
        </div>
        {webcam?.visible && canvas.width > 0 && <WebcamOverlay canvas={canvas} webcam={webcam} url={webcamUrl} time={time} playing={playing}
          selected={webcamSelected} onSelect={onSelectWebcam} onChange={onChangeWebcam} />}
        {zoom && <span className="preview__badge">{zoom.level}× · {zoom.mode === 'auto' ? 'Auto' : 'Fixed'}</span>}
      </div>
    </section>
  );
}
