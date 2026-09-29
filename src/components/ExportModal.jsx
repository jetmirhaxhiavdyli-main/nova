import React, { useEffect, useState } from 'react';
import { Button, Description, Input, Label, ListBox, Modal, Select, TextField } from '@heroui/react';
import Icon from './Icon';
import { sourcePresets } from '../exportPresets.mjs';

export const FORMATS = [
  { id: 'MP4', note: 'Works everywhere' },
  { id: 'GIF', note: 'Loops, no sound' },
  { id: 'WebM', note: 'Web-friendly video' },
];
const FRAME_RATES = ['24', '30', '50', '60'];
const GIF_FRAME_RATES = ['10', '15', '20', '30'];
// Output resolution: bounds the composition fits inside (aspect kept, never cropped or upscaled; rotated for portrait).
const RESOLUTIONS = [
  { id: 'original', name: 'Original' },
  { id: '1080p', name: 'Fit within 1920 × 1080', w: 1920, h: 1080 },
  { id: '720p', name: 'Fit within 1280 × 720', w: 1280, h: 720 },
  { id: '480p', name: 'Fit within 640 × 480 — GIF only', w: 640, h: 480, gifOnly: true },
];
/** Actual output size for a composition at a resolution. MP4 rounds to even dimensions (H.264 4:2:0). */
import { outputSize } from '../../electron/exportGeometry.mjs';
export { outputSize };
// GIF starting presets (to be benchmarked by Codex).
const GIF_PRESETS = [
  { id: 'gif-small', name: 'Small', note: 'Fits 640 × 480, 10 fps, Web quality.', format: 'GIF', resolution: '480p', fps: '10', quality: 'web' },
  { id: 'gif-balanced', name: 'Balanced', note: 'Fits 1280 × 720, 15 fps, High quality.', format: 'GIF', resolution: '720p', fps: '15', quality: 'social' },
  { id: 'gif-max', name: 'Maximum detail', note: 'Original size, 30 fps, Source quality.', format: 'GIF', resolution: 'original', fps: '30', quality: 'source' },
];
const QUALITIES = [
  { id: 'source', name: 'Source', note: 'Prioritize detail and image quality.' },
  { id: 'social', name: 'High', note: 'Looks like the original at a much smaller size.' }, // id kept for the encoder
  { id: 'web', name: 'Web', note: 'Balance quality and file size.' },
  { id: 'web-low', name: 'Web low', note: 'Smaller files for lighter pages.' },
];
// Presets fill in format, frame rate and quality; any manual change shows "Custom".
const PRESETS = [
  { id: 'recommended', name: 'Recommended', note: 'Smallest file that still looks like the original.', format: 'MP4', resolution: 'original', fps: '30', quality: 'social' },
  { id: 'web', name: 'Web', note: 'Light WebM for websites.', format: 'WebM', resolution: 'original', fps: '30', quality: 'web' },
  { id: 'native', name: 'Native', note: 'Matches the recording: full frame rate, source quality.', format: 'MP4', resolution: 'original', fps: '60', quality: 'source' },
];
const CUSTOM = { id: 'custom', name: 'Custom', note: 'Your own mix of settings.' };
/** "Nova 2026-09-28 at 14.05": sorts by date and is valid on Windows (no colons). */
function defaultFileName(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `Nova ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} at ${pad(date.getHours())}.${pad(date.getMinutes())}`;
}

/** Selectable format tile (Figma component "Export/FormatOption"). */
function FormatOption({ id, note, selected, onSelect, disabled }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className="format-tile" data-selected={selected || undefined} onClick={onSelect} disabled={disabled}>
      <span className="format-tile__name">{id}</span>
      <span className="format-tile__note">{note}</span>
      {selected && <span className="format-tile__check"><Icon name="check" size={10} /></span>}
    </button>
  );
}

function SettingSelect({ label, value, onChange, items, description, disabled }) {
  return (
    <Select className="export-select" value={value} onChange={v => v && onChange(String(v))} fullWidth isDisabled={disabled}>
      <Label>{label}</Label>
      <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
      {description && <Description>{description}</Description>}
      <Select.Popover>
        <ListBox>
          {items.map(item => <ListBox.Item key={item.id} id={item.id} textValue={item.name}>{item.name}<ListBox.ItemIndicator /></ListBox.Item>)}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/**
 * File export settings (Figma: "06 · Export").
 * `onExport({ destination, format, fps, quality, resolution, fileName, folder })`: folder null = Desktop.
 * `resolution` is 'original' | '1080p' | '720p' | '480p' (480p only with GIF).
 * `size` { width, height } is the composition (editor output canvas or the recording); null until known.
 * `progress` { label, percent } fills the Export button while busy.
 */
export default function ExportModal({ isOpen, onOpenChange, onExport, onCancel, busy, note, sourceFps, size = null, exportedPath, progress = null }) {
  const [fileName, setFileName] = useState(defaultFileName);
  const [folder, setFolder] = useState(null); // { path, name } picked this session; null = Desktop
  useEffect(() => { if (isOpen) setFileName(defaultFileName()); }, [isOpen]);
  async function chooseFolder() {
    try { const picked = await window.recorder?.chooseExportFolder(folder?.path); if (picked) setFolder(picked); } catch {}
  }
  const [format, setFormatState] = useState(PRESETS[0].format);
  const [resolution, setResolution] = useState(PRESETS[0].resolution);
  const [fps, setFps] = useState(PRESETS[0].fps);
  const [quality, setQuality] = useState(PRESETS[0].quality);
  const isGif = format === 'GIF';
  const presets = isGif ? GIF_PRESETS : sourcePresets(PRESETS, sourceFps);
  const preset = QUALITIES.find(q => q.id === quality);
  const exportPreset = presets.find(p => p.format === format && p.resolution === resolution && p.fps === fps && p.quality === quality) || CUSTOM;
  const apply = p => { setFormatState(p.format); setResolution(p.resolution); setFps(p.fps); setQuality(p.quality); };
  const applyPreset = id => { const p = presets.find(x => x.id === id); if (p) apply(p); };
  // Switching between GIF and video keeps choices valid: GIF starts from Balanced; video drops GIF-only rates/sizes.
  function setFormat(next) {
    if (next === format) return;
    if (next === 'GIF') { apply(GIF_PRESETS[1]); return; }
    setFormatState(next);
    if (isGif) {
      if (!FRAME_RATES.includes(fps)) setFps('30');
      if (resolution === '480p') setResolution('720p');
    }
  }
  const rates = isGif ? GIF_FRAME_RATES : FRAME_RATES;
  const resolutions = RESOLUTIONS.filter(r => isGif || !r.gifOnly);
  const out = outputSize(size, resolution, format);
  const dims = out ? `${out.width} × ${out.height}` : null;
  function runExport() {
    onExport({ destination: 'file', format, fps: Number(fps), quality, resolution, fileName: fileName.trim(), folder: folder?.path || null });
  }

  return (
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={!busy} isKeyboardDismissDisabled={busy}>
        <Modal.Container placement="center">
          <Modal.Dialog className="export" aria-label="Export your recording">
            <Modal.CloseTrigger isDisabled={busy} />
            <Modal.Header className="finished__header">
              <Icon name="brand" size={22} className="brand-mark" />
              <Modal.Heading>Export your recording</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="export__body">
              <p className="modal-description">Choose your export settings, a name and where to save it.</p>

              {/* key: the option lists differ for GIF vs video; remount so HeroUI rebuilds them in order. */}
              <SettingSelect key={`preset-${isGif}`} label="Preset" value={exportPreset.id} onChange={applyPreset} description={exportPreset.note} disabled={busy}
                items={exportPreset === CUSTOM ? [...presets, CUSTOM] : presets} />

              <div className="export__section">
                <span className="label" id="format-label">Format</span>
                <div className="format-tiles" role="radiogroup" aria-labelledby="format-label">
                  {FORMATS.map(f => <FormatOption key={f.id} {...f} selected={format === f.id} onSelect={() => setFormat(f.id)} disabled={busy} />)}
                </div>
              </div>

              <SettingSelect key={`resolution-${isGif}`} label="Resolution" value={resolution} onChange={setResolution} disabled={busy} items={resolutions}
                description={dims ? `Output: ${dims}` : 'Keeps the aspect ratio; never crops or upscales.'} />

              <div className="export__settings">
                <SettingSelect key={`fps-${isGif}`} label="Frame rate" value={fps} onChange={setFps} disabled={busy} description={isGif ? 'GIF timing is approximate; playback varies by viewer.' : 'Output frame rate.'}
                  items={rates.map(v => ({ id: v, name: `${v} fps` }))} />
                <SettingSelect label="Compression quality" value={quality} onChange={setQuality} description={preset.note} items={QUALITIES} disabled={busy} />
              </div>

              <div className="export__settings">
                <TextField value={fileName} onChange={setFileName} isDisabled={busy} fullWidth className="export-field">
                  <Label>File name</Label>
                  <div className="export-name">
                    <Input placeholder={defaultFileName()} aria-label="File name" />
                    <span className="export-name__ext">.{format.toLowerCase()}</span>
                  </div>
                </TextField>
                <div className="export-field">
                  <span className="label">Save to</span>
                  <button type="button" className="export-folder" onClick={chooseFolder} disabled={busy} title={folder?.path || 'Desktop'}>
                    <Icon name="folder" size={16} />
                    <span className="export-folder__name">{folder?.name || 'Desktop'}</span>
                    <span className="export-folder__change">Change</span>
                  </button>
                </div>
              </div>

              <div className="export__summary">
                <span>Selected settings</span>
                <strong>{[format, dims, `${fps} fps`, preset.name].filter(Boolean).join(' · ')}</strong>
              </div>
              {note && <p className="modal-note" role="status">{note}</p>}
            </Modal.Body>
            <Modal.Footer className="export__footer">
              {busy && <Button variant="tertiary" onPress={onCancel}>Cancel export</Button>}
              <Button size="lg" fullWidth variant={exportedPath && !busy ? 'secondary' : 'primary'} isDisabled={busy && !progress} onPress={() => { if (!busy) runExport(); }}
                className={busy && progress ? 'export-progress' : undefined} style={busy && progress ? { '--progress': `${progress.percent}%` } : undefined}
                aria-busy={busy || undefined}>
                {busy && progress
                  ? <span className="export-progress__label" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>{progress.label}{progress.percent > 0 && progress.percent < 100 ? ` ${progress.percent}%` : ''}</span>
                  : <><Icon name="arrow-down-to-line" />
                    {exportedPath && !busy ? 'Export again' : `Export ${format}`}</>}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
  );
}
