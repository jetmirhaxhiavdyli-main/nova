import React from 'react';
import PanelShell, { ComingSoonField, PanelSection, PanelSeparator, SliderField } from './PanelShell';

/**
 * Audio panel: voice, plus a "Coming soon" placeholder for music.
 * System audio (computer sound) was dropped by the user on 2026-09-27; older projects may still carry `audio.system`, which is ignored.
 * Music returns once a music library exists (audio.music / musicVolume / duck / fade are unchanged; MUSIC_TRACKS stays in constants.js).
 */
export default function AudioPanel({ audio, set, onClose }) {
  return (
    <PanelShell title="Audio" onClose={onClose}>
      <PanelSection title="Voice">
        <SliderField label="Microphone" value={audio.voice} max={150} step={5} onChange={v => set('audio', { voice: v }, 'audio.voice')} />
        {/* TODO(codex): audio.noiseReduction / evenVolume aren't applied yet; restore the SwitchFields when they are. */}
        <ComingSoonField label="Reduce background noise" />
        <ComingSoonField label="Even out volume" />
      </PanelSection>
      <PanelSeparator />
      <ComingSoon title="Music" text="Add a background track that softens while you talk." />
    </PanelShell>
  );
}

function ComingSoon({ title, text }) {
  return (
    <div className="editor-panel__section coming-soon">
      <span className="coming-soon__head">
        <span className="editor-panel__section-title">{title}</span>
        <span className="coming-soon__chip">Coming soon</span>
      </span>
      <span className="coming-soon__text">{text}</span>
    </div>
  );
}
