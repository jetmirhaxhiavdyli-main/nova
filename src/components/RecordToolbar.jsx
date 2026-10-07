import React, { useState } from 'react';
import { Button, ToggleButton, Tooltip } from '@heroui/react';
import Icon from './Icon';
import { UPDATE_PENDING, useUpdateState } from '../UpdateAbout';

const MODES = [
  { id: 'display', label: 'Display', icon: 'display' },
  { id: 'window', label: 'Window', icon: 'window' },
  { id: 'area', label: 'Area', icon: 'area' },
];

/** Icon-only effect toggle with a tooltip naming it and its state (Auto-zoom, Smooth cursor). */
function EffectToggle({ icon, label, description, isSelected, onChange, isDisabled }) {
  return (
    <Tooltip delay={300} closeDelay={0}>
      <ToggleButton variant="ghost" size="lg" isIconOnly className="toolbar__toggle" aria-label={label} isSelected={isSelected} onChange={onChange} isDisabled={isDisabled}>
        <Icon name={icon} size={16} />
      </ToggleButton>
      <Tooltip.Content className="toolbar-tip" placement="top" offset={10}>
        <strong>{label} · {isSelected ? 'On' : 'Off'}</strong>
        <span>{description}</span>
      </Tooltip.Content>
    </Tooltip>
  );
}

/**
 * Opens About / updates. While a newer version exists, the bell gets an accent dot and rings every few seconds
 * until it's opened (then the dot stays, still).
 */
function UpdateBell({ isDisabled }) {
  const [update] = useUpdateState();
  const [seen, setSeen] = useState(null);
  const pending = UPDATE_PENDING.includes(update.status);
  const ringing = pending && seen !== update.version;
  const title = !pending ? 'About Nova' : update.status === 'downloaded' ? `Nova ${update.version || ''} is ready` : 'Update downloading';
  return (
    <Tooltip delay={300} closeDelay={0}>
      <Button variant="ghost" size="lg" isIconOnly className="toolbar__toggle toolbar__bell" data-update={pending || undefined} data-ringing={ringing || undefined}
        aria-label={pending ? `${title}. Open updates` : 'About and updates'} isDisabled={isDisabled}
        onPress={() => { setSeen(update.version); window.dispatchEvent(new Event('show-about')); }}>
        <Icon name="bell" size={16} className="toolbar__bell-icon" />
      </Button>
      <Tooltip.Content className="toolbar-tip" placement="top" offset={10}>
        <strong>{title}</strong>
        <span>{pending ? 'Open to see what’s new' : 'Version and updates'}</span>
      </Tooltip.Content>
    </Tooltip>
  );
}

/**
 * Floating record toolbar (Figma: "Record toolbar").
 * Pure UI: every action is a callback so the capture logic can live elsewhere.
 * `gripProps` (from useDockDrag) makes the grip at the left edge drag the whole dock.
 */
export default function RecordToolbar({
  activePanel, onPanelChange, gripProps,
  cameraOn, cameraName,
  micOn, micName,
  autoZoom, onAutoZoomChange,
  smoothCursor, onSmoothCursorChange,
  onClose, onScreenshot, disabled,
}) {
  const toggle = id => onPanelChange(activePanel === id ? null : id);
  return (
    <div className="toolbar" role="toolbar" aria-label="New recording">
      {gripProps && <div className="toolbar__grip" role="presentation" title="Drag to move · double-click to reset" {...gripProps}><Icon name="grip" size={14} /></div>}
      {MODES.map(mode => (
        <ToggleButton
          key={mode.id}
          variant="ghost"
          className="mode-button"
          isSelected={activePanel === mode.id}
          onChange={() => toggle(mode.id)}
          isDisabled={disabled}
        >
          <Icon name={mode.icon} size={24} />
          <span className="mode-button__label">{mode.label}</span>
        </ToggleButton>
      ))}
      <span className="toolbar__separator" aria-hidden="true" />
      <EffectToggle icon="zoom-in" label="Auto-zoom" description="Zooms toward your clicks while recording" isSelected={autoZoom} onChange={onAutoZoomChange} isDisabled={disabled} />
      <EffectToggle icon="cursor-smooth" label="Smooth cursor" description="Records a smoothed, editable cursor" isSelected={smoothCursor} onChange={onSmoothCursorChange} isDisabled={disabled} />
      {/* Camera / microphone open their pickers; the button is filled while a device is on, ringed while its picker is open. */}
      <ToggleButton variant="ghost" size="lg" isIconOnly className="toolbar__toggle" data-open={activePanel === 'camera' || undefined}
        aria-label={`Camera: ${cameraOn ? cameraName || 'on' : 'off'}. Choose a camera`} aria-expanded={activePanel === 'camera'}
        isSelected={cameraOn} onChange={() => toggle('camera')} isDisabled={disabled}>
        <Icon name={cameraOn ? 'camera' : 'camera-off'} size={16} />
      </ToggleButton>
      <ToggleButton variant="ghost" size="lg" isIconOnly className="toolbar__toggle" data-open={activePanel === 'mic' || undefined}
        aria-label={`Microphone: ${micOn ? micName || 'on' : 'off'}. Choose a microphone`} aria-expanded={activePanel === 'mic'}
        isSelected={micOn} onChange={() => toggle('mic')} isDisabled={disabled}>
        <Icon name={micOn ? 'mic' : 'mic-off'} size={16} />
      </ToggleButton>
      <span className="toolbar__separator" aria-hidden="true" />
      <ToggleButton variant="ghost" size="lg" isIconOnly className="toolbar__toggle" aria-label="Recent recordings" isSelected={activePanel === 'recents'} onChange={() => toggle('recents')} isDisabled={disabled}>
        <Icon name="list" size={16} />
      </ToggleButton>
      {onScreenshot && (
        <Tooltip delay={300} closeDelay={0}>
          <Button variant="ghost" size="lg" isIconOnly className="toolbar__toggle" aria-label="Take a screenshot" isDisabled={disabled} onPress={onScreenshot}>
            <Icon name="screenshot" size={16} />
          </Button>
          <Tooltip.Content className="toolbar-tip" placement="top" offset={10}>
            <strong>Screenshot</strong>
            <span>Copy an area of your screen</span>
          </Tooltip.Content>
        </Tooltip>
      )}
      <UpdateBell isDisabled={disabled} />
      {window.recorder && <Button isIconOnly variant="ghost" size="sm" aria-label="Minimize Nova" onPress={() => window.recorder.minimizeWindow()}><span aria-hidden="true">−</span></Button>}
      <Button isIconOnly className="toolbar__close" aria-label="Close Nova" onPress={window.recorder ? () => window.recorder.closeWindow() : onClose}>
        <Icon name="close" size={12} />
      </Button>
    </div>
  );
}
