import React from 'react';
import { Button } from '@heroui/react';
import Icon from '../../Icon';
import PanelShell, { Segmented, SliderField, SwitchField } from './PanelShell';

const MODES = [{ id: 'fixed', label: 'Fixed' }, { id: 'auto', label: 'Auto' }];

/** Zoom panel: floats 8px above the timeline, centred on the selected block (positioned by Timeline). */
export default function ZoomPanel({ zoom, onChange, onDelete, onClose, style }) {
  return (
    <PanelShell title="Zoom" onClose={onClose} className="editor-panel--zoom" style={style}
      actions={<Button isIconOnly variant="ghost" size="sm" aria-label="Delete zoom" onPress={onDelete}><Icon name="trash-bin" /></Button>}>
      <SliderField label="Zoom level" value={zoom.level} min={1.25} max={3} step={0.25} format={v => `${v}×`}
        onChange={level => onChange({ level }, `zoom-level-${zoom.id}`)} />
      <div className="editor-panel__field">
        <span className="editor-panel__label">Mode</span>
        <Segmented label="Zoom mode" value={zoom.mode} options={MODES} onChange={mode => onChange({ mode })} />
        <span className="editor-panel__hint">{zoom.mode === 'auto' ? 'Follows your cursor while zoomed in.' : 'Stays on the spot you zoomed into.'}</span>
      </div>
      <SwitchField label="Instant zoom" description="Jumps in and out with no easing." isSelected={zoom.instant} onChange={instant => onChange({ instant })} />
    </PanelShell>
  );
}
