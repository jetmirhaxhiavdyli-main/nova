import React, { useEffect, useRef } from 'react';
import { Button } from '@heroui/react';
import { Panel, PickerRow } from './Pickers';
import Icon from './Icon';

/*
 * Camera and microphone pickers (panels above the toolbar, like the Display picker).
 * Pure UI. Codex supplies the devices, status, preview stream / input level and handles selection:
 *   devices     [{ id, name }]           from navigator.mediaDevices.enumerateDevices()
 *   selectedId  device id, or null = Off
 *   status      'loading' | 'ready' | 'denied' | 'none' | 'disconnected' | 'error'
 *   stream      camera preview MediaStream (camera only)
 *   level       0–1 live input level (microphone only)
 *   onSelect(id | null), onRetry(), onOpenSettings() (opens the OS privacy page; omit to hide the button)
 */

const COPY = {
  camera: {
    title: 'Camera', noun: 'camera', off: 'No camera in the recording',
    denied: ['Nova can’t use your camera', 'Allow camera access in Windows Settings → Privacy & security → Camera, then try again.'],
    none: ['No camera found', 'Connect a webcam and try again.'],
    disconnected: name => ['Camera disconnected', `${name || 'Your camera'} was unplugged. Reconnect it or pick another camera.`],
    error: ['Camera isn’t available', 'Another app may be using it. Close that app and try again.'],
  },
  mic: {
    title: 'Microphone', noun: 'microphone', off: 'No voice in the recording',
    denied: ['Nova can’t use your microphone', 'Allow microphone access in Windows Settings → Privacy & security → Microphone, then try again.'],
    none: ['No microphone found', 'Connect a microphone or headset and try again.'],
    disconnected: name => ['Microphone disconnected', `${name || 'Your microphone'} was unplugged. Reconnect it or pick another microphone.`],
    error: ['Microphone isn’t available', 'Another app may be using it. Close that app and try again.'],
  },
};

/** Problem card for denied / none / disconnected / error. */
function DeviceNotice({ kind, status, deviceName, onRetry, onOpenSettings, message }) {
  const copy = COPY[kind], entry = status === 'disconnected' ? copy.disconnected(deviceName) : copy[status];
  if (!entry) return null;
  return (
    <div className="device-notice" role="alert" data-status={status}>
      <span className="device-notice__icon"><Icon name={kind === 'camera' ? 'camera-off' : 'mic-off'} size={16} /></span>
      <span className="device-notice__text">
        <strong>{entry[0]}</strong>
        <span>{message || entry[1]}</span>
      </span>
      <span className="device-notice__actions">
        {status === 'denied' && onOpenSettings && <Button size="sm" variant="secondary" onPress={onOpenSettings}>Open settings</Button>}
        {onRetry && <Button size="sm" variant={status === 'denied' ? 'tertiary' : 'secondary'} onPress={onRetry}>Try again</Button>}
      </span>
    </div>
  );
}

function DeviceList({ kind, devices, selectedId, onSelect }) {
  return (
    <div role="radiogroup" aria-label={`${COPY[kind].title} source`} className="panel__group">
      <PickerRow name="Off" meta={COPY[kind].off} selected={!selectedId} onSelect={() => onSelect(null)}
        thumbnail={<span className="thumb-device"><Icon name={kind === 'camera' ? 'camera-off' : 'mic-off'} size={16} /></span>} />
      {devices.map(d => (
        <PickerRow key={d.id} name={d.name} meta={d.meta} selected={d.id === selectedId} onSelect={() => onSelect(d.id)}
          thumbnail={<span className="thumb-device"><Icon name={kind === 'camera' ? 'camera' : 'mic'} size={16} /></span>} />
      ))}
    </div>
  );
}

/** Live webcam preview; a silhouette while there is no stream. Mirrored like a mirror (what people expect of themselves). */
function CameraPreview({ stream, on, status }) {
  const video = useRef(null);
  useEffect(() => { if (video.current) video.current.srcObject = stream || null; }, [stream]);
  return (
    <div className="camera-preview" data-off={!on || undefined}>
      {on && stream
        ? <video ref={video} autoPlay muted playsInline />
        : <span className="camera__placeholder" aria-hidden="true"><span className="camera__head" /><span className="camera__body" /></span>}
      <span className="camera-preview__label">{!on ? 'Camera off' : status === 'loading' ? 'Starting camera…' : stream ? 'Live preview' : 'Preview'}</span>
    </div>
  );
}

/** Input level meter: 12 bars lit up to `level` (0–1). */
function LevelMeter({ level = 0, on }) {
  const lit = on ? Math.round(Math.min(1, Math.max(0, level)) * 12) : 0;
  return (
    <div className="level-meter" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((on ? level : 0) * 100)} data-off={!on || undefined}>
      <Icon name={on ? 'mic' : 'mic-off'} size={14} />
      <span className="level-meter__bars">{Array.from({ length: 12 }, (_, i) => <span key={i} data-lit={i < lit || undefined} data-hot={i >= 10 || undefined} />)}</span>
      <span className="level-meter__hint">{on ? 'Speak to test' : 'Microphone off'}</span>
    </div>
  );
}

function blocking(status) { return status === 'denied' || status === 'none'; }

export function CameraPicker({ devices = [], selectedId = null, onSelect, status = 'ready', stream = null, onRetry, onOpenSettings, message }) {
  const selected = devices.find(d => d.id === selectedId);
  return (
    <Panel title="Camera" meta={status === 'loading' ? 'Looking for cameras…' : `${devices.length} ${devices.length === 1 ? 'camera' : 'cameras'}`}>
      {!blocking(status) && <CameraPreview stream={stream} on={!!selectedId} status={status} />}
      <DeviceNotice kind="camera" status={status} deviceName={selected?.name} onRetry={onRetry} onOpenSettings={onOpenSettings} message={message} />
      {!blocking(status) && <DeviceList kind="camera" devices={devices} selectedId={selectedId} onSelect={onSelect} />}
    </Panel>
  );
}

export function MicPicker({ devices = [], selectedId = null, onSelect, status = 'ready', level = 0, onRetry, onOpenSettings, message }) {
  const selected = devices.find(d => d.id === selectedId);
  return (
    <Panel title="Microphone" meta={status === 'loading' ? 'Looking for microphones…' : `${devices.length} ${devices.length === 1 ? 'microphone' : 'microphones'}`}>
      {!blocking(status) && <LevelMeter level={level} on={!!selectedId && status === 'ready'} />}
      <DeviceNotice kind="mic" status={status} deviceName={selected?.name} onRetry={onRetry} onOpenSettings={onOpenSettings} message={message} />
      {!blocking(status) && <DeviceList kind="mic" devices={devices} selectedId={selectedId} onSelect={onSelect} />}
    </Panel>
  );
}
