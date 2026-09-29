import React from 'react';
import { Button } from '@heroui/react';
import PanelShell, { ComingSoonField, PanelSection, PanelSeparator, SliderField, SwitchField } from './PanelShell';
import { CURSOR_STYLES } from '../constants';

function CursorPreview({ style }) {
  if (style === 'touch') return <span className="cursor-tile__touch" aria-hidden="true" />;
  const [w, h] = style === 'large' ? [20, 28] : [15, 21];
  return (
    <svg width={w} height={h} viewBox="-1 -1 15 21" aria-hidden="true">
      <path d="M0 0 L0 16 L4.2 12.2 L7 18.5 L9.6 17.4 L6.9 11.2 L12.5 11.2 Z" fill="#111113" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Video panel: frame (scale, roundness, shadow) and cursor (smoothness, style, switches).
 * "Video scale" edits `background.padding` (the space around the recording, % of canvas width per side):
 * scale = 100 − 2 × padding, so 0–20% padding shows as 100–60%.
 */
export default function VideoPanel({ video, cursor, background, set, onClose }) {
  const moved = !!(video.position?.x || video.position?.y);
  const hasBackground = background?.mode !== 'none';
  return (
    <PanelShell title="Video" onClose={onClose}>
      <PanelSection title="Frame">
        {hasBackground
          ? <SliderField label="Video scale" value={Math.round(100 - 2 * (background.padding || 0))} min={60} max={100}
              onChange={v => set('background', { padding: (100 - v) / 2 }, 'background.padding')} />
          : <span className="editor-panel__hint">The recording fills the frame. Add a background to scale it down.</span>}
        <SliderField label="Roundness" value={video.roundness} max={32} format={v => `${v} px`} onChange={v => set('video', { roundness: v }, 'video.roundness')} />
        <SliderField label="Shadow" value={video.shadow} step={5} onChange={v => set('video', { shadow: v }, 'video.shadow')} />
        <div className="editor-panel__row">
          <span className="editor-panel__label">Position</span>
          <span className="editor-panel__value">{moved ? 'Moved' : 'Centered'}</span>
          <Button variant="ghost" size="sm" isDisabled={!moved} onPress={() => set('video', { position: { x: 0, y: 0 } })}>Reset</Button>
        </div>
        <span className="editor-panel__hint">Drag the recording on the canvas to move it.</span>
      </PanelSection>
      <PanelSeparator />
      <PanelSection title="Cursor">
        <SliderField label="Smoothness" value={cursor.smoothness} step={5} onChange={v => set('cursor', { smoothness: v }, 'cursor.smoothness')} />
        <div className="editor-panel__field">
          <span className="editor-panel__label" id="cursor-style-label">Style</span>
          <div className="cursor-tiles" role="radiogroup" aria-labelledby="cursor-style-label">
            {CURSOR_STYLES.map(option => {
              // A removed style (light/dot/ring) from an older project shows as Default, which is what it renders as.
              const selected = (CURSOR_STYLES.some(s => s.id === cursor.style) ? cursor.style : 'default') === option.id;
              return (
                <button key={option.id} type="button" role="radio" aria-checked={selected} className="cursor-tile" data-selected={selected || undefined}
                  onClick={() => set('cursor', { style: option.id })}>
                  <CursorPreview style={option.id} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <SwitchField label="Click sound" isSelected={cursor.clickSound} onChange={v => set('cursor', { clickSound: v })} />
        <SwitchField label="Hide cursor" isSelected={cursor.hidden} onChange={v => set('cursor', { hidden: v })} />
        {/* TODO(codex): cursor.stopAtEnd isn't applied in preview/export yet; restore the SwitchField when it is. */}
        <ComingSoonField label="Stop cursor at the end" />
      </PanelSection>
    </PanelShell>
  );
}
