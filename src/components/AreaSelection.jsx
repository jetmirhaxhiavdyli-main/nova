import React, { useRef } from 'react';

const MIN = 120;

/**
 * Dashed area outline with corner handles (Figma: "Area selection").
 * Move by dragging inside, resize from the corners. `ratio` locks the aspect ratio when set.
 * `rect` is in CSS pixels of this window; the capture code converts it to screen pixels.
 */
export default function AreaSelection({ rect, onChange, ratio, scale = 1, min = MIN }) {
  const start = useRef(null);

  function begin(event, handle) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { handle, x: event.clientX, y: event.clientY, rect };
  }
  function move(event) {
    const s = start.current; if (!s) return;
    const dx = event.clientX - s.x, dy = event.clientY - s.y;
    let { x, y, width, height } = s.rect;
    if (s.handle === 'move') { x += dx; y += dy; }
    else {
      if (s.handle.includes('left')) { x += dx; width -= dx; } else width += dx;
      if (s.handle.includes('top')) { y += dy; height -= dy; } else height += dy;
      width = Math.max(min, width); height = Math.max(min, height);
      if (ratio) {
        height = width / ratio;
        if (s.handle.includes('top')) y = s.rect.y + s.rect.height - height;
      }
    }
    onChange({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) });
  }
  const end = () => { start.current = null; };

  return (
    <div className="area" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onPointerDown={e => begin(e, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      role="group" aria-label={`Recording area, ${Math.round(rect.width * scale)} by ${Math.round(rect.height * scale)} pixels`}>
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(h => (
        <span key={h} className={`area__handle area__handle--${h}`} onPointerDown={e => begin(e, h)} onPointerMove={move} onPointerUp={end} />
      ))}
      <span className="area__size">{Math.round(rect.width * scale)} × {Math.round(rect.height * scale)}</span>
    </div>
  );
}
