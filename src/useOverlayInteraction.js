import { useEffect } from 'react';

const SURFACES = '.toolbar, .greeting, .panel, .hud, .camera, .area, .review, .finished, .export, .toast, .tip';

// Keep the full-size native window transparent to input except over its controls.
// Use mousemove because Electron forwards that event while ignoring mouse input.
export default function useOverlayInteraction(bridge) {
  useEffect(() => {
    if (!bridge?.setInteractive) return;
    let point = null, dragging = false, last = null, frame = 0;
    const report = interactive => {
      if (interactive !== last) { last = interactive; bridge.setInteractive(interactive); }
    };
    const update = () => {
      if(frame)cancelAnimationFrame(frame);
      frame = 0;
      // HeroUI portals render a section[role=dialog] without aria-modal.
      // Modal backdrops and portalled dropdowns must never pass clicks to the desktop.
      const modal = document.querySelector('dialog[open], [aria-modal="true"], [role="dialog"], [role="alertdialog"]');
      const hit = point && document.elementsFromPoint(point.x, point.y).some(element => element.closest(SURFACES));
      report(!!(dragging || modal || hit));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const move = event => { point = { x: event.clientX, y: event.clientY }; schedule(); };
    const down = event => { if (event.target instanceof Element && event.target.closest(SURFACES)) dragging = true; update(); };
    const up = event => { dragging = false; point={x:event.clientX,y:event.clientY};update(); };
    const leave = () => { point = null; if (!dragging) update(); };
    const blur = () => { dragging = false; point = null; update(); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'style', 'class', 'role', 'aria-modal'] });
    window.addEventListener('mousemove', move, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', blur, true);
    document.documentElement.addEventListener('mouseleave', leave);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', schedule);
    update();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', blur, true);
      document.documentElement.removeEventListener('mouseleave', leave);
      window.removeEventListener('blur', blur);
      window.removeEventListener('resize', schedule);
      bridge.setInteractive(false);
    };
  }, [bridge]);
}
