import React from 'react';
import { Button } from '@heroui/react';
import PanelShell, { PanelSection, Segmented, SliderField, SwitchField } from './PanelShell';
import { CAMERA_DEFAULTS, CAMERA_SHAPES, CAMERA_SIZE } from '../constants';

/** Camera panel: show/hide, shape, size, mirror, position. Drag or resize the camera in the preview too. */
export default function CameraPanel({ camera, set, onClose }) {
  const cam = { ...CAMERA_DEFAULTS, ...camera };
  const moved = cam.x !== CAMERA_DEFAULTS.x || cam.y !== CAMERA_DEFAULTS.y;
  return (
    <PanelShell title="Camera" onClose={onClose}>
      <SwitchField label="Show camera" isSelected={cam.visible} onChange={v => set('camera', { visible: v })} />
      {cam.visible && <PanelSection title="Look">
        <Segmented label="Camera shape" value={cam.shape} options={CAMERA_SHAPES} onChange={shape => set('camera', { shape })} />
        <SliderField label="Size" value={Math.round(cam.size * 100)} min={CAMERA_SIZE.min * 100} max={CAMERA_SIZE.max * 100}
          onChange={v => set('camera', { size: v / 100 }, 'camera.size')} />
        <SwitchField label="Mirror" description="Flip horizontally, like a mirror" isSelected={cam.mirror} onChange={v => set('camera', { mirror: v })} />
        <div className="editor-panel__row">
          <span className="editor-panel__label">Position</span>
          <span className="editor-panel__value">{moved ? 'Moved' : 'Bottom right'}</span>
          <Button variant="ghost" size="sm" isDisabled={!moved} onPress={() => set('camera', { x: CAMERA_DEFAULTS.x, y: CAMERA_DEFAULTS.y })}>Reset</Button>
        </div>
        <span className="editor-panel__hint">Drag the camera in the preview to move it; drag its corner to resize.</span>
      </PanelSection>}
    </PanelShell>
  );
}
