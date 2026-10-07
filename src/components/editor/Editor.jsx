import { editorCamera, editorCursor, motionTimeline } from '../../editorMotion.mjs';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Toast, toast } from '@heroui/react';
import EditorHeader from './EditorHeader';
import SceneBar from './SceneBar';
import PreviewCanvas from './PreviewCanvas';
import Timeline from './Timeline';
import VideoPanel from './panels/VideoPanel';
import BackgroundPanel from './panels/BackgroundPanel';
import AudioPanel from './panels/AudioPanel';
import { CAMERA_DEFAULTS, NEW_ZOOM_LENGTH, outputDims, TRIM_MIN_LENGTH, ZOOM_DEFAULTS, ZOOM_MIN_LENGTH, clamp } from './constants';
import CameraPanel from './panels/CameraPanel';
import { Tips } from '../Tips';
import { loadThumbnails, loadVoicePeaks } from '../../timelineMedia.mjs';

/*
 * Nova editor (Figma: "08 · Editor — main screen (handoff)" + "08 · Editor panels (handoff)").
 * Front end only: every edit lives in one reducer; capture data, audio processing, saving and
 * export are Codex's part (see TODO(codex) below).
 *
 * `recording`: { name, url, duration (s), size {width,height}, project,
 *                cursor [[t,x,y]…], clicks [t…], voice [{peak,speech}…], music [peak…], zooms [...] }
 */

// Edits that undo/redo tracks. Playback, selection and saving are not part of the history.
const snapshot = s => ({ video: s.video, cursor: s.cursor, background: s.background, audio: s.audio, output: s.output, camera: s.camera, splits: s.timeline.splits, removed: s.timeline.removed || [], zooms: s.timeline.zooms, trim: s.timeline.trim });
const touches = (a, b, row) => a === 'both' || b === 'both' || a === row || b === row;
/** Deleted video (or video + audio) section containing t, if any: playback skips over it. */
export const removedVideoAt = (removed, t) => (removed || []).find(r => r.target !== 'audio' && t >= r.start && t < r.end - 0.001) || null;
const restore = (s, snap) => ({
  ...s, video: snap.video, cursor: snap.cursor, background: snap.background, audio: snap.audio, output: snap.output, camera: snap.camera,
  timeline: { ...s.timeline, splits: snap.splits, removed: snap.removed || [], zooms: snap.zooms, trim: snap.trim },
});

/** The kept part of the recording in seconds. `trim.end` null = the end of the recording (also covers older sessions). */
export function trimRange(s) {
  const end = Math.min(s.timeline.trim?.end ?? s.duration, s.duration);
  return { start: clamp(s.timeline.trim?.start || 0, 0, end), end };
}

function initState({ recording, initial }) {
  const s = {
    selection: { 'editor-video': 'video', 'editor-background': 'background', 'editor-audio': 'audio', 'editor-camera': 'camera' }[initial] || null,
    video: { roundness: 24, shadow: 0, position: { x: 0, y: 0 } }, // position: offset from centre, fraction of the canvas
    cursor: { smoothness: 70, style: 'default', clickSound: false, hidden: false, stopAtEnd: true },
    background: { mode: 'preset', preset: 0, color: '#7c3aed', padding: 8 },
    audio: { voice: 100, noiseReduction: true, evenVolume: false, music: 'none', musicVolume: 30, duck: true, fade: true },
    output: { size: '16:9' },
    camera: { ...CAMERA_DEFAULTS }, // used only when the recording has a camera track (recording.camera) // 1920×1080; large-monitor recordings are scaled down to it
    timeline: { time: 0, playing: false, splits: [], removed: [], trim: { start: 0, end: null }, hideTrimmed: false, zooms: (recording.zooms || []).map(z => ({ ...ZOOM_DEFAULTS, ...z })) },
    project: { name: recording.project || null, savedAt: null },
    duration: recording.duration || 0,
    dirty: false,
    history: { past: [], future: [], lastKey: null, lastAt: 0 },
  };
  // Preview states: open with a representative setup.
  if (initial === 'editor-background') s.background = { ...s.background, mode: 'preset' };
  if (initial === 'editor-zoom' && s.timeline.zooms[0]) s.selection = { zoomId: s.timeline.zooms[0].id };
  if (initial) s.timeline.time = 12.4;
  return s;
}

/** Apply an undoable edit. Rapid edits with the same key (a slider drag) collapse into one step. */
function commit(prev, key, next) {
  const now = Date.now(), h = prev.history;
  // `drag:<gesture id>` keys stay one step for the whole pointer gesture, however slow.
  const coalesce = key && h.lastKey === key && (key.startsWith('drag:') || now - h.lastAt < 800);
  const past = coalesce ? h.past : [...h.past, snapshot(prev)].slice(-100);
  return { ...next, dirty: true, history: { past, future: [], lastKey: key, lastAt: now } };
}

const withZooms = (s, zooms) => ({ ...s, timeline: { ...s.timeline, zooms } });

function reducer(s, a) {
  switch (a.type) {
    case 'select': return { ...s, selection: a.selection };
    case 'duration': return a.duration > 0 && Math.abs(a.duration - s.duration) > 0.01 ? { ...s, duration: a.duration } : s;
    // Playback and seeking stay inside the trimmed range, so the preview matches the export.
    case 'time': { const r = trimRange(s); return { ...s, timeline: { ...s.timeline, time: clamp(a.time, r.start, r.end) } }; }
    case 'play': {
      const r = trimRange(s), t = s.timeline.time;
      return { ...s, timeline: { ...s.timeline, playing: true, time: t < r.start || t >= r.end - 0.05 ? r.start : t } };
    }
    case 'pause': return { ...s, timeline: { ...s.timeline, playing: false } };
    // View setting only (not an edit, not in undo): show just the kept range on the timeline.
    case 'hideTrimmed': return { ...s, timeline: { ...s.timeline, hideTrimmed: a.value } };
    case 'togglePlayback': return reducer(s, { type: s.timeline.playing ? 'pause' : 'play' });
    case 'tick': {
      let time = a.videoTime ?? s.timeline.time + a.dt;
      const { end } = trimRange(s);
      for (let gap = removedVideoAt(s.timeline.removed, time); gap; gap = removedVideoAt(s.timeline.removed, time)) time = gap.end;
      if (time >= end) return { ...s, timeline: { ...s.timeline, time: end, playing: false } };
      return { ...s, timeline: { ...s.timeline, time } };
    }
    case 'trim': {
      const r = trimRange(s);
      let start = a.patch.start ?? r.start, end = a.patch.end ?? r.end;
      if (a.patch.start !== undefined) start = clamp(start, 0, end - TRIM_MIN_LENGTH);
      if (a.patch.end !== undefined) end = clamp(end, start + TRIM_MIN_LENGTH, s.duration);
      if (s.duration < TRIM_MIN_LENGTH) return s;
      const trim = { start: start < 0.01 ? 0 : start, end: end > s.duration - 0.01 ? null : end };
      const time = clamp(a.seek ?? s.timeline.time, start, end);
      return commit(s, a.key || null, { ...s, timeline: { ...s.timeline, trim, time, playing: false } });
    }
    case 'set': return commit(s, a.key || a.section, { ...s, [a.section]: { ...s[a.section], ...a.patch } });
    case 'addSplit': {
      const { t, target } = a;
      const exists = s.timeline.splits.some(x => Math.abs(x.t - t) < 0.3 && (x.target === target || x.target === 'both' || target === 'both'));
      if (t <= 0.3 || t >= s.duration - 0.3 || exists) return s;
      return commit(s, null, { ...s, timeline: { ...s.timeline, splits: [...s.timeline.splits, { t, target }] } });
    }
    // Section between splits on a row ('video' | 'audio' | 'both'); undoable, confirmed in the timeline.
    case 'removeSection': {
      const removed = s.timeline.removed || [];
      if (!(a.end > a.start) || removed.some(r => r.start < a.end && r.end > a.start && touches(r.target, a.target))) return s;
      return commit(s, null, { ...s, timeline: { ...s.timeline, removed: [...removed, { start: a.start, end: a.end, target: a.target }] } });
    }
    case 'restoreSection': {
      const removed = (s.timeline.removed || []).filter(r => !(r.start === a.start && r.end === a.end && r.target === a.target));
      return commit(s, null, { ...s, timeline: { ...s.timeline, removed } });
    }
    // Removing a split also restores deleted sections that ended or started at it (they'd lose their edge).
    case 'removeSplit': {
      const gone = s.timeline.splits[a.index]; if (!gone) return s;
      const splits = s.timeline.splits.filter((_, i) => i !== a.index);
      const edge = t => Math.abs(t - gone.t) < 0.001;
      const removed = (s.timeline.removed || []).filter(r => !((edge(r.start) || edge(r.end)) && touches(r.target, gone.target)));
      return commit(s, null, { ...s, timeline: { ...s.timeline, splits, removed } });
    }
    case 'addZoom': {
      const start = clamp(s.timeline.time, 0, Math.max(0, s.duration - ZOOM_MIN_LENGTH));
      const zoom = { id: `z${Date.now().toString(36)}`, start, end: Math.min(s.duration, start + NEW_ZOOM_LENGTH), ...ZOOM_DEFAULTS, focus: a.focus };
      return { ...commit(s, null, withZooms(s, [...s.timeline.zooms, zoom])), selection: { zoomId: zoom.id } };
    }
    case 'updateZoom': return commit(s, a.key || `zoom-${a.id}`, withZooms(s, s.timeline.zooms.map(z => z.id === a.id ? { ...z, ...a.patch, enabled: true } : z)));
    case 'deleteZoom': return { ...commit(s, null, withZooms(s, s.timeline.zooms.filter(z => z.id !== a.id))), selection: null };
    case 'undo': case 'redo': {
      const h = s.history, from = a.type === 'undo' ? h.past : h.future;
      if (!from.length) return s;
      const snap = from[from.length - 1], rest = from.slice(0, -1);
      const next = restore(s, snap);
      const history = a.type === 'undo'
        ? { past: rest, future: [...h.future, snapshot(s)], lastKey: null, lastAt: 0 }
        : { past: [...h.past, snapshot(s)], future: rest, lastKey: null, lastAt: 0 };
      const zoomGone = s.selection?.zoomId && !next.timeline.zooms.some(z => z.id === s.selection.zoomId);
      return { ...next, dirty: true, history, selection: zoomGone ? null : s.selection };
    }
    case 'saved': return { ...s, project: { name: a.name ?? s.project.name, savedAt: Date.now() }, dirty: false };
    default: return s;
  }
}

/**
 * Typing/scroll stretches in seconds for the timeline, from recorded `activity` events
 * ({ type: 'activity', kind, time ms }): events of one kind less than 1.2 s apart form one stretch.
 */
function activityStretches(events) {
  const out = [], open = {};
  for (const e of [...events].filter(e => e.type === 'activity').sort((a, b) => a.time - b.time)) {
    const t = e.time / 1000, run = open[e.kind];
    if (run && t - run.end <= 1.2) run.end = t + 0.3;
    else { open[e.kind] = { kind: e.kind, start: t, end: t + 0.3 }; out.push(open[e.kind]); }
  }
  return out;
}

/** Cursor position (normalised) at time t from [[t,x,y]…], eased between samples. */
export function cursorAt(path, t) {
  if (!path?.length) return null;
  for (let i = 0; i < path.length - 1; i++) {
    const [t0, x0, y0] = path[i], [t1, x1, y1] = path[i + 1];
    if (t >= t0 && t <= t1) { const k = (t - t0) / (t1 - t0 || 1), e = k * k * (3 - 2 * k); return { x: x0 + (x1 - x0) * e, y: y0 + (y1 - y0) * e }; }
  }
  const last = t < path[0][0] ? path[0] : path[path.length - 1];
  return { x: last[1], y: last[2] };
}

// Short click tick for previewing "Click sound". TODO(codex): the exported click sound.
let audioContext;
function playClick() {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioContext.createOscillator(), g = audioContext.createGain(), now = audioContext.currentTime;
    o.type = 'triangle'; o.frequency.value = 1900;
    g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    o.connect(g); g.connect(audioContext.destination); o.start(); o.stop(now + 0.06);
  } catch { /* audio is optional */ }
}

export default function Editor({ recording, initial = null, onBack, onExport, onSaveProject, onAutosave, session }) {
  const [state, dispatch] = useReducer(reducer, { recording, initial }, args => session?.current || initState(args));
  useEffect(() => { if (session) session.current = { ...state, timeline: { ...state.timeline, playing: false } }; }, [state, session]);
  const [videoSize, setVideoSize] = useState(recording.size || null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const stageRef = useRef(null), videoRef = useRef(null), prevTime = useRef(state.timeline.time);
  const { time, playing } = state.timeline;
  // Audio-only deleted sections are silent in preview, as in export (cutExport.mjs mutes them).
  const audioCut = (state.timeline.removed || []).some(r => r.target === 'audio' && time >= r.start && time < r.end);
  useEffect(()=>{const v=videoRef.current;if(v){v.muted=!recording.hasMic||audioCut;v.volume=Math.min(1,Math.max(0,(state.audio.voice??100)/100));}},[recording.hasMic,state.audio.voice,audioCut]);
  const duration = state.duration;

  // ---- derived ----
  const source = videoSize || { width: 1920, height: 1080 };
  const output = outputDims(state.output, source);
  const sampleCursor = useMemo(() => editorCursor(recording.events || [], state.cursor.smoothness), [recording.events, state.cursor.smoothness]);
  // Real timeline media: voice peaks (only when the recording has a mic) and filmstrip thumbnails.
  const [media, setMedia] = useState({});
  useEffect(() => {
    if (!recording.url || !(duration > 0)) return;
    const abort = new AbortController(); setMedia({});
    loadThumbnails(recording.url, duration, { signal: abort.signal }).then(thumbnails => { if (!abort.signal.aborted) setMedia(m => ({ ...m, thumbnails })); });
    if (recording.hasMic) loadVoicePeaks(recording.url, { signal: abort.signal }).then(voice => { if (!abort.signal.aborted && voice.length) setMedia(m => ({ ...m, voice })); }).catch(() => {});
    return () => abort.abort();
  }, [recording.url, recording.hasMic, duration]);
  const zoomsOn = state.video.zoom !== false;
  const liveZooms = zoomsOn ? state.timeline.zooms : [];
  const sampleCamera = useMemo(() => editorCamera(liveZooms, duration, recording.events), [liveZooms, duration, recording.events]);
  const camera = sampleCamera(time * 1000);
  const cursor = recording.events ? (recording.cursorFree ? sampleCursor(time * 1000) : null) : cursorAt(recording.cursor, time);
  const activity = useMemo(() => (recording.events ? activityStretches(recording.events) : recording.activity || []), [recording.events, recording.activity]);
  const selectedZoom = state.selection?.zoomId ? state.timeline.zooms.find(z => z.id === state.selection.zoomId) : null;
  const activeZoom = useMemo(() => {
    const inside = liveZooms.filter(z => time >= z.start && time < z.end);
    return inside[inside.length - 1] || null; // later blocks win where they overlap
  }, [liveZooms, time]);

  // ---- stage size (the preview re-fits to it) ----
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStage({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- playback: the video drives time when there is one, otherwise a clock does ----
  const timeRef = useRef(time); timeRef.current = time;
  useEffect(() => {
    if (!playing) return;
    const v = videoRef.current;
    if (v) { if (Math.abs(v.currentTime - timeRef.current) > 0.05) v.currentTime = timeRef.current; v.play().catch(() => dispatch({ type: 'pause' })); }
    let frame, last = performance.now();
    const step = now => {
      dispatch({ type: 'tick', dt: (now - last) / 1000, videoTime: v && !v.paused ? v.currentTime : null });
      last = now; frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(frame); v?.pause(); };
  }, [playing]);
  useEffect(() => { const v = videoRef.current; if (v && !playing && Math.abs(v.currentTime - time) > 0.02) v.currentTime = time; }, [time, playing]);
  // While playing, a jump over a deleted section moves the video too.
  useEffect(() => { const v = videoRef.current; if (v && playing && time - v.currentTime > 0.2) v.currentTime = time; }, [time, playing]);
  useEffect(() => {
    const prev = prevTime.current; prevTime.current = time;
    if (playing && state.cursor.clickSound && !state.cursor.hidden && recording.clicks?.some(c => c > prev && c <= time)) playClick();
  }, [time, playing, state.cursor.clickSound, state.cursor.hidden, recording.clicks]);

  // ---- keyboard: Esc closes the open panel (HeroUI menus/popovers handle their own Esc first) ----
  useEffect(() => {
    const onKey = e => {
      if (e.defaultPrevented || e.isComposing || document.querySelector('[role="dialog"]:not(.editor):not(.editor-panel), [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      if (e.key === 'Escape' && state.selection) { e.preventDefault(); deselect(); return; }
      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // The timeline playhead and trim handles don't use Space, so it still plays/pauses after dragging them.
        const control = e.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), button:not(.preview__handle), [role="slider"]:not(.timeline__scrub, .timeline__trim-handle), [role="switch"], [role="combobox"], [role="textbox"]');
        if (control) return;
        e.preventDefault();
        if (!e.repeat) dispatch({ type: 'togglePlayback' });
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.target.closest?.('input, textarea')) { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); }
      else if (mod && e.key.toLowerCase() === 'y' && !e.target.closest?.('input, textarea')) { e.preventDefault(); dispatch({ type: 'redo' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.selection]);

  // ---- actions ----
  const set = useCallback((section, patch, key) => dispatch({ type: 'set', section, patch, key }), []);
  const toggleSelect = id => dispatch({ type: 'select', selection: state.selection === id ? null : id });
  const close = () => dispatch({ type: 'select', selection: null });
  function deselect() {
    dispatch({ type: 'select', selection: null });
    stageRef.current?.closest('.editor')?.focus({ preventScroll: true });
  }

  async function save({ mode, name }) {
    try {
      // TODO(codex): window.recorder.saveProject({ mode: 'current' | 'new' | 'single', name }) → { projectName }.
      const result = onSaveProject ? await onSaveProject({ mode, name, edits: editsFor(state, recording.events) }) : { projectName: mode === 'single' ? null : name || state.project.name };
      const projectName = result?.projectName ?? (mode === 'single' ? state.project.name : name);
      dispatch({ type: 'saved', name: mode === 'single' ? state.project.name : projectName });
      toast.success(mode === 'single' ? 'Saved as a single recording' : mode === 'new' ? `Created “${projectName}” and saved` : `Saved to ${projectName}`, { timeout: 2600 });
      return true;
    } catch (error) {
      toast.danger(`Could not save: ${error.message}`, { timeout: 4000 });
      return false;
    }
  }

  // Autosave: edits (not the video) are written ~1.5 s after the last change. Watches only edit fields;
  // the timeline object also carries the playhead, which changes constantly while playing.
  const latest = useRef(state); latest.current = state;
  useEffect(() => {
    if (!onAutosave || !state.dirty) return;
    const timer = setTimeout(async () => {
      const snapshot = latest.current, fields = editFields(snapshot);
      // Marked saved only if no edit changed meanwhile; otherwise the newer change's own timer saves it.
      try { if (await onAutosave(editsFor(snapshot, recording.events)) && editFields(latest.current).every((v, i) => v === fields[i])) dispatch({ type: 'saved' }); }
      catch { /* the Save button still works; the next change retries */ }
    }, 1500);
    return () => clearTimeout(timer);
  }, [state.dirty, ...editFields(state)]);

  const panel = ['video', 'background', 'audio', 'camera'].includes(state.selection) ? state.selection : null;
  // Camera track (TODO(codex): recording.camera = { url } for the recorded webcam, time-aligned with the screen).
  const hasCamera = !!recording.camera;
  const webcam = { ...CAMERA_DEFAULTS, ...state.camera }; // older sessions/projects have no camera settings

  return (
    // aria-modal: the editor covers the overlay window, so it takes all input (see useOverlayInteraction).
    <div className="editor" tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Editing ${recording.name}`}>
      <Toast.Provider placement="bottom" className="editor__toasts" />
      {/* First-run tips (scene bar, then timeline); they wait while a side panel is open. */}
      <Tips set="editor" active={!panel} />
      <div className="editor__frame">
      <EditorHeader name={recording.name} saved={!!state.project.savedAt && !state.dirty}
        outputSize={state.output.size} output={output} source={source} onOutputSize={(size, dims) => set('output', { size, ...dims })}
        canUndo={state.history.past.length > 0} canRedo={state.history.future.length > 0}
        onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })}
        projectName={state.project.name} onSave={save} onBack={onBack} onExport={() => {dispatch({type:'pause'});onExport?.(editsFor(state,recording.events), { width: output.width, height: output.height });}} />

      <div className="editor__stage" ref={stageRef} onPointerDown={e => { if (e.target === e.currentTarget) deselect(); }}>
        <SceneBar selection={state.selection} onSelect={toggleSelect} video={state.video} background={state.background} audio={state.audio} camera={hasCamera ? webcam : null} />
        <PreviewCanvas stage={stage} panelOpen={!!panel} output={output} source={source}
          windowCapture={recording.windowCapture} url={recording.url} videoRef={videoRef} onVideoSize={setVideoSize} onDuration={d => dispatch({ type: 'duration', duration: d })}
          video={state.video} background={state.background} cursorSettings={state.cursor} playing={playing}
          camera={camera} cursor={cursor} time={time} clicks={recording.clicks} zoom={activeZoom}
          videoSelected={state.selection === 'video'} onSelectVideo={() => dispatch({ type: 'select', selection: 'video' })}
          onDeselect={deselect}
          backgroundEditable={panel === 'background'}
          onSelectBackground={() => dispatch({ type: 'select', selection: 'background' })}
          onMoveBackground={position => set('background', { image: { ...state.background.image, ...position } }, 'background.image.position')}
          onMoveVideo={position => set('video', { position }, 'video.position')}
          webcam={hasCamera ? webcam : null} webcamUrl={recording.camera?.url} webcamSelected={panel === 'camera'}
          onSelectWebcam={() => dispatch({ type: 'select', selection: 'camera' })}
          onChangeWebcam={(patch, key) => set('camera', patch, key)} />
        {panel === 'video' && <VideoPanel video={state.video} cursor={state.cursor} background={state.background} set={set} onClose={close} />}
        {panel === 'background' && <BackgroundPanel background={state.background} set={set} onClose={close} />}
        {panel === 'audio' && <AudioPanel audio={state.audio} set={set} onClose={close} />}
        {panel === 'camera' && hasCamera && <CameraPanel camera={webcam} set={set} onClose={close} />}
      </div>

      <Timeline duration={duration} time={time} playing={playing} output={output}
        trim={trimRange(state)} onTrim={(patch, key, seek) => dispatch({ type: 'trim', patch, key, seek })}
        clicks={recording.clicks} activity={activity}
        hideTrimmed={!!state.timeline.hideTrimmed} onHideTrimmed={value => dispatch({ type: 'hideTrimmed', value })}
        onPlayToggle={() => dispatch({ type: playing ? 'pause' : 'play' })}
        onSeek={t => dispatch({ type: 'time', time: t })}
        splits={state.timeline.splits} onSplit={target => dispatch({ type: 'addSplit', t: time, target })}
        removed={state.timeline.removed || []}
        onRemoveSection={section => dispatch({ type: 'removeSection', ...section })}
        onRestoreSection={section => dispatch({ type: 'restoreSection', ...section })}
        onRemoveSplit={index => dispatch({ type: 'removeSplit', index })}
        fps={recording.fps} zooms={state.timeline.zooms} zoomsOn={zoomsOn} onZoomsToggle={on => set('video', { zoom: on })} selectedZoom={selectedZoom}
        onAddZoom={() => dispatch({ type: 'addZoom', focus: cursor ? { x: cursor.x, y: cursor.y } : { x: 0.5, y: 0.5 } })}
        onSelectZoom={id => dispatch({ type: 'select', selection: id ? { zoomId: id } : null })}
        onUpdateZoom={(id, patch, key) => dispatch({ type: 'updateZoom', id, patch, key })}
        onDeleteZoom={id => dispatch({ type: 'deleteZoom', id })}
        audio={state.audio} voice={media.voice || recording.voice} music={recording.music} speech={media.voice ? undefined : recording.speech} thumbnails={media.thumbnails}
        audioSelected={state.selection === 'audio'} onOpenAudio={() => dispatch({ type: 'select', selection: 'audio' })} />
      </div>
    </div>
  );
}

/**
 * Everything export/save needs, in recording seconds. TODO(codex): apply these on export.
 * `trim` { start, end } is the kept range; export only that part (end always a number here).
 */
/** The state parts that make up saved edits (the reducer replaces a part only when it changes). */
const editFields = s => [s.video, s.cursor, s.background, s.audio, s.output, s.camera, s.duration, s.timeline.splits, s.timeline.removed, s.timeline.trim, s.timeline.zooms];

function editsFor(s, events) {
  // Music is "Coming soon": force none so an older project with a track selected can still export.
  // Zooms switched off (video.zoom === false) export with no zoom; the blocks are kept for switching back on.
  const zooms = s.video.zoom === false ? [] : s.timeline.zooms;
  return { video: s.video, cursor: s.cursor, background: s.background, audio: { ...s.audio, music: 'none' }, output: s.output, camera: { ...CAMERA_DEFAULTS, ...s.camera }, splits: s.timeline.splits, removed: s.timeline.removed || [], zooms, zoomTimeline: motionTimeline(zooms, s.duration, events), duration: s.duration, trim: trimRange(s) };
}
