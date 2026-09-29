import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const MARGIN = 32;
const SIZE = { width: 180, height: 180 };

function cornerPosition(corner, bounds) {
  const x = corner.endsWith('left') ? MARGIN : bounds.width - SIZE.width - MARGIN;
  const y = corner.startsWith('top') ? MARGIN : bounds.height - SIZE.height - MARGIN;
  return { x, y };
}

/**
 * Webcam overlay (Figma component "Camera/Bubble"): 20px corners, drag anywhere to move,
 * snaps to the nearest corner on release.
 * `stream` is a MediaStream from getUserMedia — until one is passed a placeholder is shown.
 */
export default function CameraBubble({ stream, corner = 'bottom-left', onCornerChange, disconnected = false }) {
  const video = useRef(null);
  const [drag, setDrag] = useState(null);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => { if (video.current) video.current.srcObject = stream || null; }, [stream]);
  useEffect(() => {
    const onResize = () => setBounds({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);

  const rest = cornerPosition(corner, bounds);
  const pos = drag ? { x: drag.x, y: drag.y } : rest;

  function onPointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x: rest.x, y: rest.y, dx: event.clientX - rest.x, dy: event.clientY - rest.y });
  }
  function onPointerMove(event) {
    if (!drag) return;
    setDrag({ ...drag, x: event.clientX - drag.dx, y: event.clientY - drag.dy });
  }
  function onPointerUp() {
    if (!drag) return;
    const vertical = drag.y + SIZE.height / 2 < bounds.height / 2 ? 'top' : 'bottom';
    const horizontal = drag.x + SIZE.width / 2 < bounds.width / 2 ? 'left' : 'right';
    setDrag(null);
    onCornerChange?.(`${vertical}-${horizontal}`);
  }
  function onKeyDown(event) {
    const map = { ArrowUp: ['top', null], ArrowDown: ['bottom', null], ArrowLeft: [null, 'left'], ArrowRight: [null, 'right'] };
    if (!map[event.key]) return;
    event.preventDefault();
    const [v, h] = map[event.key]; const [cv, ch] = corner.split('-');
    onCornerChange?.(`${v || cv}-${h || ch}`);
  }

  return (
    <div className="camera" data-dragging={drag ? true : undefined}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      tabIndex={0} role="group" aria-label="Camera preview. Drag, or use arrow keys, to move it to another corner."
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
      {stream && !disconnected
        ? <video ref={video} autoPlay muted playsInline />
        : <span className="camera__placeholder" aria-hidden="true"><span className="camera__head" /><span className="camera__body" /></span>}
      {disconnected && <span className="camera__alert" role="alert"><Icon name="camera-off" size={16} />Camera disconnected</span>}
      <span className="camera__handle" aria-hidden="true"><Icon name="grip" size={14} />Drag</span>
    </div>
  );
}
