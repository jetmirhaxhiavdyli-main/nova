import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertDialog, Button, Label, Switch } from '@heroui/react';
import Icon from '../Icon';
import SplitMenu from './menus/SplitMenu';
import ZoomPanel from './panels/ZoomPanel';
import { MUSIC_BUCKETS, MUSIC_TRACKS, ROWS, SPLIT_ROWS, WAVE_BUCKETS, ZOOM_MIN_LENGTH, clamp, formatTime } from './constants';

const PANEL_W = 288, PROMPT_W = 264, TRACK_INSET = 16; // timeline padding left/right
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const tickLabel = t => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const round1 = t => Math.round(t * 10) / 10;

/** Placeholder music shape per track until real peaks arrive. TODO(codex): music track peaks. */
function placeholderMusic(track) {
  const seed = MUSIC_TRACKS.findIndex(t => t.id === track) + 1;
  return Array.from({ length: MUSIC_BUCKETS }, (_, i) => 0.5 + 0.35 * Math.abs(Math.sin(i * 0.31 * seed) * Math.sin(i * 0.13 + seed)));
}

/**
 * Timeline card: toolbar, ruler, clip, voice audio, music, zoom track, trim, splits and playhead.
 * Times are recording seconds. The track shows a view range: the whole recording, or only the kept
 * (trimmed) part when the user hides trimmed parts — a view setting, the trim itself is unchanged.
 */
const ROW_LABEL = { both: 'video and audio', video: 'video', audio: 'audio' };
/** Pieces of a row between its splits ([] when the row has no split, so it stays one plain bar). */
function segmentsFor(splits, row, duration) {
  const cuts = [...new Set(splits.filter(s => s.target === 'both' || s.target === row).map(s => s.t))].sort((a, b) => a - b);
  if (!cuts.length) return [];
  const edges = [0, ...cuts, duration];
  return edges.slice(0, -1).map((start, i) => ({ start, end: edges[i + 1], row }));
}
const sameSpan = (a, b) => Math.abs(a.start - b.start) < 0.001 && Math.abs(a.end - b.end) < 0.001;

export default function Timeline({ duration, fps, time, playing, output, trim, onTrim, hideTrimmed, onHideTrimmed, onPlayToggle, onSeek, splits, onSplit, zooms, zoomsOn = true, onZoomsToggle, selectedZoom, onAddZoom, onSelectZoom, onUpdateZoom, onDeleteZoom,
  removed = [], onRemoveSection, onRestoreSection, onRemoveSplit,
  audio, voice, music, speech, audioSelected, onOpenAudio, clicks = [], activity = [], thumbnails = [] }) {
  const [selectedSegment, setSelectedSegment] = useState(null); // { start, end, row }
  const [confirm, setConfirm] = useState(null); // { kind: 'section', section: {start, end, target} } | { kind: 'split', index }
  const trackRef = useRef(null), drag = useRef(null), promptTimer = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const [splitPreview, setSplitPreview] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [frozenView, setFrozenView] = useState(null); // keeps the scale still while a trim handle is dragged
  const [prompt, setPrompt] = useState(null); // 'start' | 'end': ask whether to hide trimmed parts
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    const el = trackRef.current; if (!el) return;
    const observer = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- view range ----
  const trimmed = trim.start > 0 || trim.end < duration;
  const hidden = hideTrimmed && trimmed;
  const view = frozenView || (hidden ? { start: trim.start, end: trim.end } : { start: 0, end: duration });
  const span = Math.max(0.001, view.end - view.start);
  const x = t => `${((t - view.start) / span * 100).toFixed(3)}%`;
  const w = length => `${(length / span * 100).toFixed(3)}%`;
  const timeAt = clientX => { const r = trackRef.current.getBoundingClientRect(); return clamp(view.start + (clientX - r.left) / r.width * span, 0, duration); };
  // With trimmed parts hidden, times read like the export: 0:00 at the trim start.
  const shown = t => (hidden ? t - trim.start : t);

  // ---- ruler (labels relative to the view start) ----
  const ticks = useMemo(() => {
    const step = TICK_STEPS.find(s => span / s <= 10) || 600;
    return Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => i * step).filter(r => r === 0 || r / span < 0.97);
  }, [span]);

  // ---- clip row: click keyframes (merged when closer than ~8px) and typing/scroll stretches ----
  const clickDots = useMemo(() => {
    const near = trackWidth ? 8 / trackWidth * span : 0.2, dots = [];
    for (const t of [...clicks].filter(t => t >= view.start && t <= view.end).sort((a, b) => a - b)) {
      const last = dots[dots.length - 1];
      if (last && t - last.times[last.times.length - 1] < near) last.times.push(t);
      else dots.push({ times: [t] });
    }
    return dots.map(d => ({ ...d, t: d.times.reduce((a, b) => a + b, 0) / d.times.length }));
  }, [clicks, view.start, view.end, span, trackWidth]);
  // Filmstrip: each thumbnail covers its slice of the recording (thumbnails are evenly spaced).
  const visibleThumbs = useMemo(() => {
    if (!thumbnails.length || !duration) return [];
    const slice = duration / thumbnails.length;
    return thumbnails.map((f, i) => ({ ...f, from: i * slice, to: (i + 1) * slice })).filter(f => f.to > view.start && f.from < view.end);
  }, [thumbnails, duration, view.start, view.end]);
  const stretches = activity.filter(a => a.end > view.start && a.start < view.end);

  // ---- audio rows (sampled across the view) ----
  const isSpeech = useMemo(() => {
    if (speech?.length) return t => speech.some(([a, b]) => t >= a && t <= b);
    if (voice?.length) return t => voice[Math.min(voice.length - 1, Math.floor(t / duration * voice.length))]?.speech;
    return () => false;
  }, [speech, voice, duration]);
  const bucketTime = (i, n) => view.start + (i + 0.5) / n * span;

  const voiceBars = useMemo(() => Array.from({ length: WAVE_BUCKETS }, (_, i) => {
    // Real peaks (timelineMedia.mjs → Editor) scaled by the microphone volume; speech buckets are highlighted.
    const t = bucketTime(i, WAVE_BUCKETS);
    const sample = voice?.[Math.min(voice.length - 1, Math.floor(t / (duration || 1) * voice.length))];
    if (!sample) return { height: 2, speech: false };
    const { peak, speech: sp } = sample;
    return { height: Math.max(2, Math.min(20, peak * audio.voice / 100 * 20)), speech: sp };
  }), [voice, duration, view.start, span, audio.voice]);

  const musicBars = useMemo(() => {
    if (audio.music === 'none') return [];
    const peaks = music?.length ? music : placeholderMusic(audio.music);
    return Array.from({ length: MUSIC_BUCKETS }, (_, i) => {
      const t = bucketTime(i, MUSIC_BUCKETS);
      let level = peaks[Math.min(peaks.length - 1, Math.floor(t / (duration || 1) * peaks.length))] * audio.musicVolume / 100 * 2;
      if (audio.duck && isSpeech(t)) level *= 0.35;
      if (audio.fade) level *= Math.min(1, t / 2.5, (duration - t) / 2.5);
      return Math.max(1.5, Math.min(14, level * 14));
    });
  }, [audio.music, audio.musicVolume, audio.duck, audio.fade, music, duration, view.start, span, isSpeech]);

  // ---- scrubbing (ruler + clip) ----
  const capture = e => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events */ } };
  function scrubDown(e) { capture(e); drag.current = { scrub: true }; onSeek(timeAt(e.clientX)); }
  function scrubMove(e) { if (drag.current?.scrub) onSeek(timeAt(e.clientX)); }
  function scrubKey(e) {
    const step = e.shiftKey ? 5 : 1;
    const next = { ArrowLeft: time - step, ArrowRight: time + step, Home: trim.start, End: trim.end }[e.key];
    if (next !== undefined) { e.preventDefault(); onSeek(clamp(next, trim.start, trim.end)); }
  }

  // ---- trim handles: drag or arrow keys; the playhead follows so you see the new first/last frame ----
  function askToHide(side) { if (!declined && !hideTrimmed) setPrompt(side); }
  function trimDown(e, side) {
    e.stopPropagation(); capture(e);
    drag.current = { trim: side, gesture: `drag:trim-${side}-${e.timeStamp}`, moved: false };
    setFrozenView(view); setDragging(`trim-${side}`); setPrompt(null);
  }
  function trimMove(e) {
    const d = drag.current; if (!d?.trim) return;
    const t = round1(timeAt(e.clientX));
    d.moved = true;
    onTrim({ [d.trim]: t }, d.gesture, t);
  }
  function trimKey(e, side) {
    const step = e.shiftKey ? 1 : 0.1, dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    let t;
    if (dir) t = round1(trim[side] + dir * step);
    else if (e.key === 'Home' || e.key === 'End') t = side === 'start' ? 0 : duration;
    else return;
    e.preventDefault();
    onTrim({ [side]: t }, dir ? `trim-key-${side}` : null, t);
    // Ask once the keyboard adjustment settles.
    clearTimeout(promptTimer.current);
    promptTimer.current = setTimeout(() => askToHide(side), 900);
  }
  useEffect(() => () => clearTimeout(promptTimer.current), []);

  function dragEnd() {
    const d = drag.current; drag.current = null; setDragging(null);
    if (d?.trim) { setFrozenView(null); if (d.moved) askToHide(d.trim); }
  }

  // The prompt closes when the trim is reset, the parts get hidden, or the user clicks elsewhere.
  useEffect(() => { if (!trimmed || hideTrimmed) setPrompt(null); }, [trimmed, hideTrimmed]);
  useEffect(() => {
    if (!prompt) return;
    const away = e => { if (!e.target.closest?.('.trim-prompt, .timeline__trim-handle')) setPrompt(null); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [prompt]);
  function hide() { onHideTrimmed(true); setPrompt(null); }
  function keep() { setDeclined(true); setPrompt(null); }

  // ---- zoom blocks: drag body to move, edge handles to resize (min 1 s) ----
  function zoomDown(e, zoom, mode) {
    e.stopPropagation();
    capture(e);
    drag.current = { id: zoom.id, mode, gesture: `drag:zoom-${zoom.id}-${e.timeStamp}`, x0: e.clientX, width: trackRef.current.getBoundingClientRect().width, start: zoom.start, end: zoom.end };
    setDragging(zoom.id);
    onSelectZoom(zoom.id);
  }
  function zoomMove(e) {
    const d = drag.current; if (!d?.id) return;
    const dt = (e.clientX - d.x0) / d.width * span, length = d.end - d.start;
    let { start, end } = d;
    if (d.mode === 'move') { start = clamp(d.start + dt, 0, duration - length); end = start + length; }
    if (d.mode === 'start') start = clamp(d.start + dt, 0, d.end - ZOOM_MIN_LENGTH);
    if (d.mode === 'end') end = clamp(d.end + dt, d.start + ZOOM_MIN_LENGTH, duration);
    onUpdateZoom(d.id, { start: round1(start), end: round1(end) }, d.gesture);
  }
  function zoomKey(e, zoom) {
    const step = e.altKey ? 0.1 : 0.5, dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (dir) {
      e.preventDefault();
      if (e.shiftKey) onUpdateZoom(zoom.id, { end: round1(clamp(zoom.end + dir * step, zoom.start + ZOOM_MIN_LENGTH, duration)) }, `zoom-key-${zoom.id}`);
      else { const length = zoom.end - zoom.start, start = round1(clamp(zoom.start + dir * step, 0, duration - length)); onUpdateZoom(zoom.id, { start, end: round1(start + length) }, `zoom-key-${zoom.id}`); }
    } else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDeleteZoom(zoom.id); }
  }

  // Floating panels above the timeline: centred on their anchor, clamped to the card.
  const anchorLeft = (t, width) => clamp(TRACK_INSET + (t - view.start) / span * trackWidth - width / 2, 0, trackWidth + TRACK_INSET * 2 - width);
  const zoomPanelStyle = selectedZoom && trackWidth ? { left: anchorLeft((selectedZoom.start + selectedZoom.end) / 2, PANEL_W) } : null;

  // ---- split bars: after a split each row shows separate bars; click one to select, Delete (confirmed) removes it ----
  const videoSegments = useMemo(() => segmentsFor(splits, 'video', duration), [splits, duration]);
  const audioSegments = useMemo(() => segmentsFor(splits, 'audio', duration), [splits, duration]);
  const removedFor = seg => removed.find(r => r.start < seg.end - 0.001 && r.end > seg.start + 0.001 && (r.target === 'both' || r.target === seg.row)) || null;
  // A bar whose twin on the other row has the same span (a "Video and audio" split) is deleted with it.
  const targetFor = seg => ((seg.row === 'video' ? audioSegments : videoSegments).some(o => sameSpan(o, seg)) ? 'both' : seg.row);
  const isSelected = seg => !!selectedSegment && sameSpan(selectedSegment, seg) && (selectedSegment.row === seg.row || targetFor(selectedSegment) === 'both');
  // Selection clears when its bar no longer exists (split removed, undo) or on a click elsewhere in the editor.
  useEffect(() => {
    if (selectedSegment && ![...videoSegments, ...audioSegments].some(s => sameSpan(s, selectedSegment) && s.row === selectedSegment.row)) setSelectedSegment(null);
  }, [videoSegments, audioSegments, selectedSegment]);
  useEffect(() => {
    if (!selectedSegment) return;
    const away = e => { if (!e.target.closest?.('.timeline__segment, [role="alertdialog"]')) setSelectedSegment(null); };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [selectedSegment]);
  function segmentDown(e, seg) { setSelectedSegment(seg); scrubDown(e); }
  function askDelete(seg) { if (!removedFor(seg)) setConfirm({ kind: 'section', section: { start: seg.start, end: seg.end, target: targetFor(seg) } }); }
  function segmentKey(e, seg) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); askDelete(seg); }
    else scrubKey(e);
  }
  function confirmNow() {
    if (confirm?.kind === 'section') { onRemoveSection?.(confirm.section); setSelectedSegment(null); }
    if (confirm?.kind === 'split') onRemoveSplit?.(confirm.index);
    setConfirm(null);
  }

  const rowStyle = row => ({ top: ROWS[row].top, height: ROWS[row].height });
  const trackName = MUSIC_TRACKS.find(t => t.id === audio.music)?.label;
  const total = hidden ? trim.end - trim.start : duration;

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="timeline__toolbar">
        <Button isIconOnly variant="secondary" size="sm" aria-label={playing ? 'Pause' : 'Play'} onPress={onPlayToggle}><Icon name={playing ? 'pause' : 'play-outline'} /></Button>
        <span className="timeline__time">{formatTime(shown(time))} <span>/ {formatTime(total)}</span></span>
        {trimmed && <>
          {!hidden && <span className="timeline__trim-note">Trimmed to {formatTime(trim.end - trim.start)}</span>}
          <Button variant="ghost" size="sm" onPress={() => { setPrompt(null); onHideTrimmed(!hidden); }}>{hidden ? 'Show trimmed' : 'Hide trimmed'}</Button>
          <Button variant="ghost" size="sm" onPress={() => onTrim({ start: 0, end: duration })}>Reset trim</Button>
        </>}
        <span className="timeline__separator" aria-hidden="true" />
        <SplitMenu time={time} onSplit={onSplit} onPreview={setSplitPreview} isDisabled={!duration} />
        <Button variant="ghost" size="sm" onPress={onAddZoom} isDisabled={!duration || !zoomsOn}><Icon name="zoom-in" />Add zoom</Button>
        {/* Turns every zoom (auto and manual) off in preview and export; the blocks are kept for switching back on. */}
        <Switch className="editor-switch timeline__zoom-switch" size="sm" isSelected={zoomsOn} onChange={onZoomsToggle}>
          <Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control><Label>Zooms</Label></Switch.Content>
        </Switch>
        <span className="timeline__spacer" />
        <span className="timeline__meta">{output.width} × {output.height}{fps ? ` · ${fps} fps` : ''}</span>
      </div>

      <div className="timeline__track" ref={trackRef} data-hidden-trim={hidden || undefined}>
        <div className="timeline__scrub" role="slider" tabIndex={0} aria-label="Playhead" aria-valuemin={0} aria-valuemax={Math.round(total * 10) / 10}
          aria-valuenow={Math.round(shown(time) * 10) / 10} aria-valuetext={`${formatTime(shown(time))} of ${formatTime(total)}`}
          onPointerDown={scrubDown} onPointerMove={scrubMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} onKeyDown={scrubKey} />

        {ticks.map(r => <span key={r} className="timeline__tick" data-first={r === 0 || undefined} style={{ left: w(r) }}>{tickLabel(view.start > 0 && !hidden ? view.start + r : r)}</span>)}

        {/* Clip: one colour bar with typing (solid) / scrolling (dashed) stretches and click keyframes. */}
        <div className="timeline__clip" style={rowStyle('clip')} aria-hidden="true" data-thumbs={visibleThumbs.length ? true : undefined}>
          {visibleThumbs.length > 0 && <span className="timeline__filmstrip">
            {visibleThumbs.map(f => <img key={f.t} src={f.src} alt="" draggable={false} style={{ left: x(f.from), width: w(f.to - f.from) }} />)}
          </span>}
          {stretches.map((a, i) => (
            <span key={i} className="timeline__activity" data-kind={a.kind} title={`${a.kind === 'typing' ? 'Typing' : 'Scrolling'} · ${formatTime(shown(a.start))}–${formatTime(shown(a.end))}`}
              style={{ left: x(Math.max(a.start, view.start)), width: w(Math.min(a.end, view.end) - Math.max(a.start, view.start)) }} />
          ))}
        </div>
        <div className="timeline__keyframes" style={rowStyle('clip')}>
          {clickDots.map(d => {
            const label = d.times.length > 1 ? `${d.times.length} clicks · ${formatTime(shown(d.times[0]))}` : `Click · ${formatTime(shown(d.t))}`;
            return (
              <button key={d.times[0]} type="button" className="timeline__keyframe" data-count={d.times.length > 1 ? d.times.length : undefined}
                style={{ left: x(d.t) }} aria-label={`${label}. Move the playhead here`} title={label}
                onPointerDown={e => e.stopPropagation()} onClick={() => onSeek(d.times[0])} />
            );
          })}
        </div>

        <button type="button" className="timeline__audio" style={rowStyle('voice')} data-selected={audioSelected || undefined}
          aria-label="Voice. Open audio settings" onClick={onOpenAudio}>
          <Icon name="mic" size={14} className="timeline__audio-icon" />
          <span className="timeline__bars">{voiceBars.map((b, i) => <span key={i} data-speech={b.speech || undefined} style={{ height: b.height }} />)}</span>
        </button>

        {audio.music === 'none'
          ? <span className="timeline__add-music timeline__add-music--soon" style={rowStyle('music')}><Icon name="music" size={12} />Music · Coming soon</span>
          : <button type="button" className="timeline__music" style={rowStyle('music')} data-selected={audioSelected || undefined}
              aria-label={`Music: ${trackName}. Open audio settings`} onClick={onOpenAudio}>
              <span className="timeline__music-name"><Icon name="music" size={12} />{trackName}</span>
              <span className="timeline__bars timeline__bars--music">{musicBars.map((h, i) => <span key={i} style={{ height: h }} />)}</span>
            </button>}

        {/* Trimmed-off parts are dimmed across the clip and audio rows; they are left out of playback and export. */}
        {trim.start > view.start && <span className="timeline__trimmed" style={{ left: 0, width: w(trim.start - view.start) }} aria-hidden="true" />}
        {trim.end < view.end && <span className="timeline__trimmed" style={{ left: x(trim.end), right: 0 }} aria-hidden="true" />}
        {['start', 'end'].map(side => (
          <div key={side} className={`timeline__trim-handle timeline__trim-handle--${side}`} role="slider" tabIndex={0}
            data-dragging={dragging === `trim-${side}` || undefined} style={{ left: x(trim[side]) }}
            aria-label={side === 'start' ? 'Trim start' : 'Trim end'} aria-valuemin={0} aria-valuemax={Math.round(duration * 10) / 10}
            aria-valuenow={Math.round(trim[side] * 10) / 10} aria-valuetext={formatTime(trim[side])}
            title="Drag to trim · double-click to reset"
            onPointerDown={e => trimDown(e, side)} onPointerMove={trimMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}
            onDoubleClick={() => onTrim({ [side]: side === 'start' ? 0 : duration })}
            onKeyDown={e => trimKey(e, side)}><span /></div>
        ))}

        {/* After a split each row is separate bars: click to select (and seek), Delete or the bin removes it after a confirm. */}
        {[...videoSegments, ...audioSegments].filter(s => s.end > view.start && s.start < view.end).map(seg => {
          const gone = removedFor(seg), selected = isSelected(seg), left = Math.max(seg.start, view.start), right = Math.min(seg.end, view.end);
          const label = `${seg.row === 'video' ? 'Video' : 'Audio'} piece ${formatTime(shown(seg.start))}–${formatTime(shown(seg.end))}${gone ? ', deleted' : ''}`;
          return (
            <div key={`${seg.row}-${seg.start}`} className="timeline__segment" role="button" tabIndex={0} aria-pressed={selected} aria-label={`${label}. ${gone ? 'Restore it with the button.' : 'Press Delete to remove it.'}`}
              data-row={seg.row} data-selected={selected || undefined} data-removed={gone ? true : undefined}
              style={{ left: x(left), width: w(right - left), ...(seg.row === 'video' ? rowStyle('clip') : rowStyle('voice')) }}
              onPointerDown={e => segmentDown(e, seg)} onPointerMove={scrubMove} onPointerUp={dragEnd} onPointerCancel={dragEnd} onKeyDown={e => segmentKey(e, seg)}>
              {gone
                ? <button type="button" className="timeline__segment-action" aria-label="Restore this piece" title="Restore"
                    onPointerDown={e => e.stopPropagation()} onClick={() => onRestoreSection?.(gone)}><Icon name="undo" size={12} /></button>
                : selected && <button type="button" className="timeline__segment-action timeline__segment-action--delete" aria-label="Delete this piece" title="Delete"
                    onPointerDown={e => e.stopPropagation()} onClick={() => askDelete(seg)}><Icon name="trash" size={12} /></button>}
            </div>
          );
        })}
        {splits.map((s, i) => (
          <button key={i} type="button" className="timeline__cut" style={{ left: x(s.t), ...SPLIT_ROWS[s.target] }}
            aria-label={`Split in ${ROW_LABEL[s.target]} at ${formatTime(shown(s.t))}. Click to remove it.`} title="Remove this split"
            onPointerDown={e => e.stopPropagation()} onClick={() => setConfirm({ kind: 'split', index: i })} />
        ))}
        {splitPreview && <span className="timeline__cut-preview" style={{ left: x(time), ...SPLIT_ROWS[splitPreview] }} />}

        <div className="timeline__zooms" style={rowStyle('zoom')} data-off={!zoomsOn || undefined} title={zoomsOn ? undefined : 'Zooms are off'}>
          {zooms.map(zoom => {
            const selected = selectedZoom?.id === zoom.id, label = `${zoom.level}× · ${zoom.mode === 'auto' ? 'Auto' : 'Fixed'}`;
            return (
              <button key={zoom.id} type="button" className="zoom-block" data-selected={selected || undefined} data-dragging={dragging === zoom.id || undefined}
                aria-pressed={selected} aria-label={`Zoom ${label}, ${formatTime(shown(zoom.start))} to ${formatTime(shown(zoom.end))}. Arrow keys move, Shift+arrows resize, Delete removes.`}
                style={{ left: x(zoom.start), width: w(zoom.end - zoom.start) }}
                onPointerDown={e => zoomDown(e, zoom, 'move')} onPointerMove={zoomMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}
                onKeyDown={e => zoomKey(e, zoom)} onClick={() => onSelectZoom(zoom.id)}>
                <Icon name="zoom-in" size={14} />
                <span className="zoom-block__label">{label}</span>
                {selected && <>
                  <span className="zoom-block__handle zoom-block__handle--start" onPointerDown={e => zoomDown(e, zoom, 'start')} onPointerMove={zoomMove} onPointerUp={dragEnd}><span /></span>
                  <span className="zoom-block__handle zoom-block__handle--end" onPointerDown={e => zoomDown(e, zoom, 'end')} onPointerMove={zoomMove} onPointerUp={dragEnd}><span /></span>
                </>}
              </button>
            );
          })}
        </div>

        <div className="timeline__playhead" style={{ left: x(time), ...ROWS.playhead }} aria-hidden="true"><span /><span /></div>
      </div>

      {prompt && trackWidth > 0 && (
        <div className="trim-prompt" role="group" aria-labelledby="trim-prompt-title" style={{ left: anchorLeft(trim[prompt], PROMPT_W) }}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); keep(); } }}>
          <span className="trim-prompt__title" id="trim-prompt-title" role="status">Hide the trimmed parts?</span>
          <span className="trim-prompt__note">The timeline shows only what you'll export. Nothing is deleted — you can show them again anytime.</span>
          <div className="trim-prompt__actions">
            <Button variant="tertiary" size="sm" onPress={keep}>Keep visible</Button>
            <Button size="sm" onPress={hide}>Hide</Button>
          </div>
        </div>
      )}

      <AlertDialog.Backdrop isOpen={!!confirm} onOpenChange={open => { if (!open) setConfirm(null); }}>
        <AlertDialog.Container placement="center" size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{confirm?.kind === 'split' ? 'Remove this split?' : `Delete this ${ROW_LABEL[confirm?.section.target] || ''} piece?`}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {confirm?.kind === 'split'
                ? 'The pieces on each side join again. A deleted piece next to it comes back.'
                : confirm && `${formatTime(shown(confirm.section.start))}–${formatTime(shown(confirm.section.end))} is left out of playback. You can restore it or undo.`}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={() => setConfirm(null)}>Cancel</Button>
              <Button variant="danger" onPress={confirmNow}>{confirm?.kind === 'split' ? 'Remove split' : 'Delete'}</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      {selectedZoom && zoomPanelStyle && (
        <ZoomPanel zoom={selectedZoom} style={zoomPanelStyle} onClose={() => onSelectZoom(null)}
          onChange={(patch, key) => onUpdateZoom(selectedZoom.id, patch, key)} onDelete={() => onDeleteZoom(selectedZoom.id)} />
      )}
    </section>
  );
}
