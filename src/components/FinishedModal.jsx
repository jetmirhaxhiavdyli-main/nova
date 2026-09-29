import React, { useEffect, useRef, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import Icon from './Icon';
import { TipCallout } from './Tips';
import RecordedCameraPreview from '../RecordedCameraPreview';
import RecordedScreenPreview from '../RecordedScreenPreview';

const format = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Shown when a recording stops (Figma: "05 · Recording finished").
 * Actions: Delete · Editor · Save project · Export. Each is a callback.
 */
export default function FinishedModal({ isOpen, url, recording, cameraUrl, seconds, name = 'Recording', size, busy, saved, error, canEdit, onDelete, onClose, onEditor, onSaveProject, onExport }) {
  const video = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [videoSize, setVideoSize] = useState(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const total = duration || seconds || 0;
  useEffect(() => { setPosition(0); setDuration(0); setPlaying(false); setVideoSize(null); }, [url]);
  useEffect(() => { if (!isOpen) { video.current?.pause(); setPlaying(false); } }, [isOpen]);

  const dims = size || videoSize;
  const details = [name, format(seconds), dims && `${dims.width} × ${dims.height}`].filter(Boolean).join(' · ');
  function togglePlay() {
    const v = video.current; if (!v) return;
    if (v.paused) { v.play().catch(() => setPlaying(false)); } else { v.pause(); }
  }

  return (
      <Modal.Backdrop isOpen={isOpen} isDismissable={false} isKeyboardDismissDisabled onOpenChange={open => { if (!open) onClose?.(); }}>
        <Modal.Container placement="center">
          <Modal.Dialog className="finished" aria-label="Your recording is ready">
            {onClose && <Modal.CloseTrigger aria-label="Close" isDisabled={busy} />}
            <Modal.Header className="finished__header">
              <Icon name="brand" size={22} className="brand-mark" />
              <Modal.Heading>Your recording is ready</Modal.Heading>
              <p className="modal-description">{details}. Save it now, or open it in the editor to polish it.</p>
            </Modal.Header>
            <Modal.Body className="finished__body">
              <div className="finished__preview">
                {url
                  ? <video ref={video} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
                    onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
                    onDurationChange={e => { if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration); }}
                    onLoadedMetadata={e => setVideoSize({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })} onClick={togglePlay} />
                  : <span className="finished__placeholder" aria-hidden="true"><span /></span>}
                {isOpen && recording && <RecordedScreenPreview recording={recording} screen={video} />}
                {isOpen && <RecordedCameraPreview url={cameraUrl} screen={video} />}
                {!playing && (
                  <button type="button" className="finished__play" aria-label="Play recording" onClick={togglePlay} disabled={!url}>
                    <Icon name="play-outline" size={22} />
                  </button>
                )}
                <span className="finished__duration">{format(seconds)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="modal-description">{format(position)}</span>
                <input type="range" aria-label="Preview timeline" aria-valuetext={`${format(position)} of ${format(total)}`} min="0" max={total} step="0.01" value={Math.min(position, total)} disabled={!url || !total}
                  style={{ flex: 1, minWidth: 0, accentColor: 'var(--accent)' }}
                  onChange={e => { const time = Number(e.target.value); if (video.current) video.current.currentTime = time; setPosition(time); }} />
                <span className="modal-description">{format(total)}</span>
              </div>
              {saved && <p className="modal-note modal-note--success" role="status">Saved to {saved}</p>}
              {error && <p className="modal-note modal-note--danger" role="alert">{error}</p>}
              <TipCallout set="finished" />
            </Modal.Body>
            <Modal.Footer className="finished__actions">
              <Button variant="danger-soft" onPress={onDelete} isDisabled={busy}><Icon name="trash-bin" />Delete</Button>
              <span className="finished__spacer" />
              <Button variant="tertiary" onPress={onEditor} isDisabled={busy || !canEdit}><Icon name="scissors" />Editor</Button>
              <Button variant="secondary" onPress={onSaveProject} isDisabled title="Project saving will arrive with the editor"><Icon name="folder" />Save project</Button>
              <Button onPress={onExport} isDisabled={busy}><Icon name="arrow-down-to-line" />Export</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
  );
}
