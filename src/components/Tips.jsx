import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@heroui/react';

/**
 * First-run tips. Each tip shows once per PC (localStorage), one at a time, in the order below.
 * "Skip tips" turns them all off; About → "Show tips again" resets them (resetTips).
 * Floating tips anchor to a target element; the finished-modal tip is an inline callout (see TipCallout),
 * because a card outside a modal would count as an outside click and close it.
 */
export const TIP_SETS = {
  toolbar: [
    { id: 'modes', target: '.toolbar .mode-button', title: 'Choose what to record', text: 'Pick your whole display, one window, or an area you draw.' },
    { id: 'auto-zoom', target: '.toolbar [aria-label="Auto-zoom"]', title: 'Auto-zoom', text: 'Follows your clicks and typing, so viewers see what matters.' },
    { id: 'smooth-cursor', target: '.toolbar [aria-label="Smooth cursor"]', title: 'Smooth cursor', text: 'Replaces a jittery mouse with a smooth one in the final video.' },
    { id: 'devices', target: '.toolbar [aria-label^="Camera:"]', title: 'Camera and microphone', text: 'Add your webcam and mic. You can move the camera bubble anywhere.' },
  ],
  finished: [
    { id: 'finished', title: 'What’s next?', text: 'Open the Editor to add backgrounds, zooms and trims, or Export right away.' },
  ],
  editor: [
    { id: 'scene', target: '.scene-bar', placement: 'bottom', title: 'Style your recording', text: 'Click Video, Background, Camera or Audio to change how it looks.' },
    { id: 'timeline', target: '.timeline__toolbar', title: 'Edit on the timeline', text: 'Drag the edges to trim, press Split to cut, and click a zoom to adjust it.' },
  ],
};

const SEEN = 'nova-tips-seen', OFF = 'nova-tips-off';
const listeners = new Set();
const load = () => { try { return { seen: new Set(JSON.parse(localStorage.getItem(SEEN) || '[]')), off: localStorage.getItem(OFF) === '1' }; } catch { return { seen: new Set(), off: false }; } };
let state = load();
const save = () => { try { localStorage.setItem(SEEN, JSON.stringify([...state.seen])); localStorage.setItem(OFF, state.off ? '1' : '0'); } catch { /* still works for this session */ } listeners.forEach(fn => fn()); };
const markSeen = id => { state.seen.add(id); save(); };
const skipAll = () => { state.off = true; save(); };
export function resetTips() { state = { seen: new Set(), off: false }; save(); }

function useTipState() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force(n => n + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
  return state;
}
/** The first unseen tip of a set, or null (also null when tips are off). */
function useNextTip(set) {
  const s = useTipState();
  return s.off ? null : TIP_SETS[set].find(t => !s.seen.has(t.id)) || null;
}

function TipBody({ tip, set, as: Tag = 'div', className, style, arrow }) {
  const tips = TIP_SETS[set], index = tips.indexOf(tip);
  return (
    <Tag className={className} style={style} role="dialog" aria-label={tip.title}>
      {arrow}
      <strong className="tip__title">{tip.title}</strong>
      <span className="tip__text">{tip.text}</span>
      <span className="tip__footer">
        <button type="button" className="tip__skip" onClick={skipAll}>Skip tips</button>
        {tips.length > 1 && <span className="tip__count">{index + 1} of {tips.length}</span>}
        <Button size="sm" onPress={() => markSeen(tip.id)}>Got it</Button>
      </span>
    </Tag>
  );
}

/**
 * Floating tip for a set, pointing at its target. `active` gates it (e.g. no panel open, not recording).
 * `above` optionally names an element the tip must clear (the greeting sits above the toolbar).
 */
export function Tips({ set, active = true, above }) {
  const tip = useNextTip(set);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!active || !tip?.target) { setPos(null); return; }
    let frame = 0;
    const place = () => {
      const target = document.querySelector(tip.target);
      if (!target) { setPos(null); return; }
      const r = target.getBoundingClientRect(), clear = above && document.querySelector(above)?.getBoundingClientRect();
      const width = 272, x = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12);
      const arrowX = Math.min(Math.max(16, r.left + r.width / 2 - x), width - 16);
      const next = tip.placement === 'bottom'
        ? { left: x, top: r.bottom + 10, width, arrowX, placement: 'bottom' }
        : { left: x, bottom: window.innerHeight - Math.min(r.top, clear?.top ?? r.top) + 10, width, arrowX, placement: 'top' };
      setPos(p => JSON.stringify(p) === JSON.stringify(next) ? p : next);
    };
    place();
    // Targets move with animations and layout changes; a light poll keeps the tip attached.
    const timer = setInterval(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); }, 200);
    window.addEventListener('resize', place);
    return () => { clearInterval(timer); cancelAnimationFrame(frame); window.removeEventListener('resize', place); };
  }, [tip, active, above]);
  if (!active || !tip || !pos) return null;
  const { arrowX, placement, ...style } = pos;
  return createPortal(
    <TipBody tip={tip} set={set} className="tip" style={style} arrow={<span className="tip__arrow" data-placement={placement} style={{ left: arrowX }} aria-hidden="true" />} />,
    document.body,
  );
}

/** Inline tip inside a surface (the finished modal). */
export function TipCallout({ set }) {
  const tip = useNextTip(set);
  return tip ? <TipBody tip={tip} set={set} className="tip tip--inline" /> : null;
}
