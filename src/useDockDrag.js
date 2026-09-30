import { useLayoutEffect, useRef, useState } from 'react';

const KEY = 'nova-dock-offset', MARGIN = 8, ZERO = { x: 0, y: 0 };

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) return { x: value.x, y: value.y };
  } catch {}
  return ZERO;
}

// How far a rect must move to sit fully on screen (0 when it already does).
function nudge(rect) {
  const x = Math.min(Math.max(rect.left, MARGIN), Math.max(MARGIN, window.innerWidth - rect.width - MARGIN)) - rect.left;
  const y = Math.min(Math.max(rect.top, MARGIN), Math.max(MARGIN, window.innerHeight - rect.height - MARGIN)) - rect.top;
  return { x, y };
}

/**
 * Lets the user drag the recorder dock by a grip handle. The chosen `offset` is applied as a CSS `translate` on the
 * dock (the window itself stays full-screen) and remembered between launches. A separate temporary `shift` keeps the
 * dock on screen when the window shrinks or a picker grows it; it relaxes again when there is room and is never saved.
 * `watch` re-checks the fit when the dock's content changes (pickers opening, toasts).
 * Returns { dockProps, gripProps } to spread onto the dock element and the handle.
 */
export default function useDockDrag(watch) {
  const [offset, setOffset] = useState(load), [shift, setShift] = useState(ZERO);
  const dockRef = useRef(null), drag = useRef(null), latest = useRef({ offset, shift });
  latest.current = { offset, shift };

  const save = value => { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch {} };

  useLayoutEffect(() => {
    const fit = () => {
      const element = dockRef.current;
      if (!element || drag.current) return;
      const r = element.getBoundingClientRect(), s = latest.current.shift;
      const next = nudge({ left: r.left - s.x, top: r.top - s.y, width: r.width, height: r.height });
      setShift(p => Math.abs(p.x - next.x) < 0.5 && Math.abs(p.y - next.y) < 0.5 ? p : next);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [watch, offset]);

  const finish = () => { if (drag.current) { drag.current = null; save(latest.current.offset); } };

  const gripProps = {
    onPointerDown(event) {
      if (event.button !== 0 || !dockRef.current) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      // Fold the temporary shift into the offset so dragging starts from what is on screen.
      const { offset: o, shift: s } = latest.current, start = { x: o.x + s.x, y: o.y + s.y };
      setOffset(start); setShift(ZERO);
      drag.current = { x: event.clientX, y: event.clientY, start, rect: dockRef.current.getBoundingClientRect() };
    },
    onPointerMove(event) {
      const d = drag.current;
      if (!d) return;
      const dx = event.clientX - d.x, dy = event.clientY - d.y;
      const fix = nudge({ left: d.rect.left + dx, top: d.rect.top + dy, width: d.rect.width, height: d.rect.height });
      setOffset({ x: d.start.x + dx + fix.x, y: d.start.y + dy + fix.y });
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onDoubleClick() { setOffset(ZERO); setShift(ZERO); save(ZERO); },
  };

  return { dockProps: { ref: dockRef, style: { translate: `${offset.x + shift.x}px ${offset.y + shift.y}px` } }, gripProps };
}
