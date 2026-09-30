import { exportEditor } from './editorExport.mjs';
import { CURSOR_SPRING } from './cursorMotion.mjs';
import { editorZooms } from './editorMotion.mjs';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@heroui/react';
import RecordToolbar from './components/RecordToolbar';
import useDockDrag from './useDockDrag';
import { AREA_PRESETS, AreaPicker, DisplayPicker, RecentRecordings, WindowPicker } from './components/Pickers';
import RecordingHud from './components/RecordingHud';
import CameraBubble from './components/CameraBubble';
import AreaSelection from './components/AreaSelection';
import FinishedModal from './components/FinishedModal';
import ExportModal from './components/ExportModal';
import Editor from './components/editor/Editor';
import { PREVIEW_DEVICES, PREVIEW_EDITOR, PREVIEW_FOLDERS, PREVIEW_RECORDINGS, PREVIEW_SOURCES } from './previewData';
import { CameraPicker, MicPicker } from './components/DevicePickers';
import './style.css';
import './theme.js'; // applies the saved light/dark/system theme before the first render
import useOverlayInteraction from './useOverlayInteraction';
import { createAreaCapture, cropPixels } from './areaCapture.mjs';
import { captureDeadline } from './captureDeadline.mjs';
import { recordMotion } from './recordingMotion.mjs';
import { reviewEdits } from './reviewEdits.mjs';
import { recordingMime } from './recordingCodec.mjs';
import { createNativeCapture } from './nativeCapture.mjs';
import { createDeviceInputs } from './deviceInputs.mjs';
import { KEYFRAME_MS, recordCamera } from './cameraRecording.mjs';
import { prepareRecordingInputs } from './recordingStartup.mjs';
import UpdateAbout from './UpdateAbout';
import { Tips } from './components/Tips';

/** Pixel size of a recording (for the Export modal's output dimensions); null if it can't be read. */
function probeSize(url) {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const v = document.createElement('video'), done = size => { v.removeAttribute('src'); v.load(); resolve(size); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => done(v.videoWidth && v.videoHeight ? { width: v.videoWidth, height: v.videoHeight } : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

/*
 * Screens:
 *   idle       → greeting + floating toolbar, optional picker / recents panel above it
 *   recording  → small HUD (+ camera bubble when the camera is on)
 *   review     → "Your recording is ready" modal (Delete · Editor · Save project · Export)
 *                → File export modal
 *                → Editor (full window; Back returns to the modal)
 *
 * In a plain browser (no window.recorder) the UI runs on sample data, and
 * `?preview=display|window|area|recents|recording|paused|camera|review|export|export-progress|
 *  editor|editor-video|editor-background|editor-audio|editor-zoom` jumps to a state.
 */

const bridge = window.recorder;
const PREVIEW = !bridge ? new URLSearchParams(location.search).get('preview') : null;

function App() {
  useOverlayInteraction(bridge);
  // ---- UI state ----
  const [panel, setPanel] = useState(['display', 'window', 'area', 'recents'].includes(PREVIEW) ? PREVIEW : PREVIEW?.startsWith('camera-') ? 'camera' : PREVIEW?.startsWith('mic-') ? 'mic' : null);
  // Camera / microphone. The id is the chosen device, or null = Off.
  // TODO(codex): fill devices from enumerateDevices(), set status ('loading' | 'ready' | 'denied' | 'none' | 'disconnected' | 'error'),
  // open the preview stream / input level for the selected device, and record them when on.
  const previewDevices = !bridge ? PREVIEW_DEVICES(PREVIEW) : null;
  const [camera, setCamera] = useState(previewDevices?.camera || { devices: [], selectedId: null, status: 'loading', stream: null });
  const [mic, setMic] = useState(previewDevices?.mic || { devices: [], selectedId: null, status: 'loading', level: 0 });
  const cameraOn = !!camera.selectedId && camera.status !== 'denied' && camera.status !== 'none';
  const micOn = !!mic.selectedId && mic.status !== 'denied' && mic.status !== 'none';
  const [autoZoom, setAutoZoom] = useState(true);
  const [smoothCursor, setSmoothCursor] = useState(true);
  // Recording frame rate: 30 fps keeps the PC responsive (60 cost ~41% vs ~31% CPU). Cursor/zoom events stay at 16 ms precision.
  const captureFps = 30;
  const sourceFps = useRef(null);
  // Session-only originals and timed motion, ready for the future editor.
  const editorAsset = useRef(null), captureSession = useRef(null), pausePending = useRef(false);
  const [notice, setNotice] = useState('');
  const [cameraCorner, setCameraCorner] = useState('bottom-left');
  const [displayId, setDisplayId] = useState(null);
  const [windowId, setWindowId] = useState(null);
  const [areaPreset, setAreaPreset] = useState('custom');
  const [area, setArea] = useState({ x: 58, y: 37, width: 480, height: 270 });
  const [recents, setRecents] = useState(bridge ? [] : PREVIEW_RECORDINGS);

  // ---- capture state (existing behaviour, unchanged) ----
  const [sources, setSources] = useState([]);
  const [phase, setPhase] = useState(['recording', 'paused', 'camera'].includes(PREVIEW) ? 'recording' : PREVIEW === 'export-progress' ? 'saving' : ['review', 'export'].includes(PREVIEW) || PREVIEW?.startsWith('editor') ? 'review' : 'idle');
  const [exportOpen, setExportOpen] = useState(['export', 'export-progress'].includes(PREVIEW));
  const [editorOpen, setEditorOpen] = useState(!!PREVIEW?.startsWith('editor'));
  const projectInfo = useRef(null);
  const editorSession = useRef(null);
  const editorEdits = useRef(null); // latest editor settings, handed to export
  const [exportSize, setExportSize] = useState(PREVIEW ? { width: 1920, height: 1080 } : null); // composition size shown in the Export modal (editor canvas or recording)
  const [exportNote, setExportNote] = useState('');
  const [exportProgress, setExportProgress] = useState(PREVIEW === 'export-progress' ? { label: 'Exporting…', percent: 42 } : null); // { label, percent } shown inside the Export button while busy
  const [exportedPath, setExportedPath] = useState(null);
  const editorExportAbort = useRef(null);
  const exportBusy = useRef(false), exportCancelled = useRef(false), clipDuration = useRef(0);
  const [paused, setPaused] = useState(PREVIEW === 'paused');
  const [error, setError] = useState(''), [url, setUrl] = useState('');
  useEffect(() => { bridge?.setEditorWindow(editorOpen).catch(e => setError(e.message)); }, [editorOpen]);
  const [seconds, setSeconds] = useState(PREVIEW ? 42 : 0), [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(false);
  const recording = useRef(null), stream = useRef(null), blob = useRef(null), started = useRef(0), pausedFor = useRef(0), pausedAt = useRef(0), previousUrl = useRef(''), discarding = useRef(false);
  const busy = ['starting', 'recording', 'stopping', 'saving'].includes(phase);
  const cameraRecording=useRef(null),cameraBlob=useRef(null);
  const inputs=useMemo(()=>bridge?createDeviceInputs({mediaDevices:navigator.mediaDevices,storage:localStorage,
    update:(kind,patch)=>(kind==='camera'?setCamera:setMic)(old=>({...old,...patch})),
    onEnded:kind=>{setError(`${kind==='camera'?'Camera':'Microphone'} disconnected. Recording stopped; captured footage is kept.`);stop();},
  }):null,[]);
  useEffect(()=>{if(!inputs)return;inputs.refresh();const refresh=()=>inputs.refresh();navigator.mediaDevices.addEventListener('devicechange',refresh);
    return()=>{navigator.mediaDevices.removeEventListener('devicechange',refresh);inputs.dispose();};},[inputs]);
  useEffect(()=>{if(!inputs||busy)return;void inputs.preview(panel==='camera'||panel==='mic'?panel:null);},[inputs,panel,busy]);

  const displays = useMemo(() => sources.filter(s => s.type === 'Screen'), [sources]);
  const windows = useMemo(() => sources.filter(s => s.type === 'Window'), [sources]);

  async function refresh() {
    setLoading(true); setError('');
    try {
      const items = bridge ? await bridge.sources() : PREVIEW_SOURCES;
      setSources(items);
      const screens = items.filter(s => s.type === 'Screen'), wins = items.filter(s => s.type === 'Window');
      setDisplayId(old => screens.find(s => s.id === old)?.id || screens[0]?.id || null);
      setWindowId(old => wins.find(s => s.id === old)?.id || wins[0]?.id || null);
      if (!items.length) setError('No screens found. Check that a display is connected and restart Nova.');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  function stop() { if (recording.current && recording.current.state !== 'inactive') { setPhase('stopping'); recording.current.stop(); } }
  useEffect(() => { refresh(); return bridge?.onStop(stop); }, []);
  useEffect(() => bridge?.onExportProgress(percent => setExportProgress(percent >= 100 ? { label: 'Saving file…', percent: 100 } : { label: 'Exporting…', percent })), []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (phase !== 'recording' || paused || PREVIEW) return;
    const timer = setInterval(() => setSeconds(Math.floor((performance.now() - started.current - pausedFor.current) / 1000)), 200);
    return () => clearInterval(timer);
  }, [phase, paused]);
  // Warn on close only for footage that exists nowhere else: not saved to a file and not autosaved to Recents.
  useEffect(() => { const listener = e => { if (busy || (blob.current && !saved && !projectInfo.current?.id)) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener); }, [busy, saved]);
  useEffect(() => { if (['display','window','area'].includes(panel)) refresh(); }, [panel]);

  async function start(sourceId, selectedArea = null) {
    if (!bridge) { setError('Recording works in the Nova desktop app. This is a browser preview.'); return; }
    if (!sourceId && !selectedArea) return;
    if (busy) return;
    setError(''); setNotice('Preparing recording…'); setPanel(null); setPhase('starting'); setPaused(false); pausedFor.current = 0; pausedAt.current = 0;
    let cropped = null, native = null, motion = null;
    const startupBegan=performance.now(),startupTimings={};
    // Every start-up step is time-limited: a capture API that never answers must become a visible error, not a silent hang
    // (a tester's Display/Area recordings sat on the toolbar forever). `smooth` can drop to false if cursor-free capture fails.
    const limit=captureDeadline;
    let smooth = smoothCursor;
    const diag = (level, text) => { try { bridge.logDiagnostics?.(level, text); } catch {} };
    diag('info', `record start: ${selectedArea ? 'area' : String(sourceId).split(':')[0]} · smoothCursor=${smoothCursor} autoZoom=${autoZoom} camera=${!!camera.selectedId} mic=${!!mic.selectedId}`);
    try {
      const selection = selectedArea ? { area: { ...selectedArea }, viewport: { width: window.innerWidth, height: window.innerHeight }, geometry: await limit(bridge.areaSource(),8000,'The display for this area did not respond') } : null;
      if (selection) sourceId = selection.geometry.sourceId;
      await limit(bridge.select(sourceId),8000,'The selected source did not respond');
      // Protect before starting either capture path, so even its first frame is clean.
      await limit(bridge.active(true),8000,'Nova could not prepare the recording window');
      sourceFps.current = captureFps;
      const standard=async()=>{
        const stream=await limit(navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:captureFps,max:captureFps}},audio:false}),15000,'Windows did not start the screen capture. Try again, or choose a window instead',late=>late.getTracks().forEach(t=>t.stop()));
        return {stream,dispose:()=>stream.getTracks().forEach(track=>track.stop())};
      };
      const ready=await prepareRecordingInputs(inputs,async()=>{
        if(!smooth)return standard();
        // Startup has an independent watchdog; a heartbeat detects a stalled capture process.
        try { return await createNativeCapture(bridge,sourceId,error=>{if(error)setError(error.message);stop();},captureFps,selection); }
        catch (error) {
          // Fall back to standard capture (the system cursor is recorded as is) instead of failing the recording.
          console.warn('Smooth cursor capture unavailable, using standard capture:', error?.message);
          smooth = false; startupTimings.fallback = error?.message || 'native capture failed';
          return standard();
        }
      },(stage,ms)=>{startupTimings[stage]=Math.round(ms);});
      const devices=ready.devices,capture=ready.capture.stream;
      native=ready.capture;
      captureSession.current=native;
      stream.current = capture;
      const compositionBegan=performance.now();
      const sourceSize=native.sourceSize || capture.getVideoTracks()[0].getSettings();
      const crop=native.crop || (selection ? cropPixels(selection.area,selection.geometry,selection.viewport,sourceSize) : null);
      if (autoZoom || smooth) await limit(bridge.trackClicks(sourceId),8000,'Click tracking did not start');
      motion=recordMotion({bridge,sourceSize,crop,zoomEnabled:autoZoom,
        clock: () => recording.current ? Math.max(0,(pausedAt.current || performance.now()) - started.current - pausedFor.current) : 0,
        isPaused: () => recording.current?.state !== 'recording',
      });
      // Native areas are already cropped before transfer. Standard capture needs one crop surface.
      if(selection&&!native.crop)cropped=await limit(createAreaCapture(capture,selection,{
        fps:captureFps,zoomEnabled:false,cursorEnabled:false,isPaused:()=>recording.current?.state!=='recording',
      }),12000,'The recording area did not start',late=>late.dispose());
      startupTimings.composition=Math.round(performance.now()-compositionBegan);
      // Preserve codec preference and quality. Codec support alone does not prove hardware encoding.
      const mimeType = recordingMime({width:crop?.width||sourceSize.width,height:crop?.height||sourceSize.height,hasMic:!!devices.mic},type=>MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('This device cannot encode WebM recordings.');
      const withMic=video=>new MediaStream([...video.getVideoTracks(),...(devices.mic?.getAudioTracks()||[])]);
      // A keyframe every second keeps editor/export seeks cheap (the default is a single keyframe at the start).
      const recorderOptions = { mimeType, videoBitsPerSecond: 16000000, videoKeyFrameIntervalDuration: KEYFRAME_MS };
      const recorder = new MediaRecorder(withMic(cropped?.stream || capture), recorderOptions);
      cameraBlob.current=null;
      cameraRecording.current=devices.camera?recordCamera(devices.camera,e=>{setError(e.message);stop();}):null;
      // One full-quality original; review/editor/export render the editable effects afterward.
      const chunks = []; let failed = false;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => { failed = true; setError('Recording ran into a problem. Any footage captured so far is kept.'); stop(); };
      recorder.onstop = async () => {
        const end = recorder.state === 'inactive' && pausedAt.current ? pausedAt.current : performance.now();
        clipDuration.current = Math.max(0, (end - started.current - pausedFor.current) / 1000);
        const cameraDone=cameraRecording.current?.finish();
        motion?.dispose();cropped?.dispose();native?.dispose();captureSession.current=null;
        cameraBlob.current=cameraDone?await cameraDone:null;
        if(cameraDone&&!cameraBlob.current&&!discarding.current)setError('The camera recording was unavailable. Your screen recording has been kept.');
        cameraRecording.current=null;
        const original=new Blob(chunks,{type:mimeType});
        editorAsset.current = !discarding.current && original.size ? {
          version: 2, sourceId, selection, duration: clipDuration.current, fps: sourceFps.current, hasMic:!!devices.mic,
          raw:original,deferredEffects:autoZoom||smooth,events:motion.events,cursorFree:smooth,
          zoomTimeline:motion.snapshot(clipDuration.current*1000),
          effects: {autoZoom, smoothCursor: smooth, cursorSpring:CURSOR_SPRING},
        } : null;
        inputs.release();
        capture.getTracks().forEach(track => track.stop()); stream.current = null; recording.current = null;
        if (discarding.current) { discarding.current = false; chunks.length = 0; cameraBlob.current=null; editorAsset.current=null; setPhase('idle'); await bridge.active(false); return; }
        blob.current = original;
        if (previousUrl.current) URL.revokeObjectURL(previousUrl.current);
        const next = blob.current.size ? URL.createObjectURL(blob.current) : '';
        previousUrl.current = next; setUrl(next); setSaved('');
        if (!next && !failed) setError('No video was captured. Try another screen or window.');
        setPhase(next ? 'review' : 'idle');
        await bridge.active(false);
        if (next) autosaveRecording();
      };
      capture.getVideoTracks()[0].onended = stop;
      if([devices.camera,devices.mic].some(s=>s?.getTracks().some(t=>t.readyState!=='live')))throw Error('A selected device disconnected before recording started. Choose a device and try again.');
      recording.current = recorder; started.current = performance.now(); cameraRecording.current?.recorder.start(1000); recorder.start(1000); setSeconds(0); setNotice(startupTimings.fallback ? 'Smooth cursor isn’t available for this screen, so this recording uses your normal cursor.' : ''); setPhase('recording');
      // Local timings only (no media/device names) to diagnose hardware-specific startup stalls.
      startupTimings.total=Math.round(performance.now()-startupBegan);
      startupTimings.codec=mimeType;
      startupTimings.capture={path:native.sourceSize?'native':'standard',width:crop?.width||sourceSize.width,height:crop?.height||sourceSize.height,fps:captureFps,screenEncoders:1,cameraEncoders:devices.camera?1:0,videoBitsPerSecond:recorder.videoBitsPerSecond,encoderImplementation:'unknown'};
      console.info('Recording startup (ms)',startupTimings);
      diag(startupTimings.fallback ? 'warn' : 'info', `record started ${JSON.stringify(startupTimings)}`);
    } catch (e) {
      if(cameraRecording.current?.recorder.state!=='inactive'){try{cameraRecording.current?.recorder.stop();}catch{}}
      cameraRecording.current=null;cameraBlob.current=null;inputs.release();
      cropped?.dispose();
      motion?.dispose();
      native?.dispose();
      captureSession.current=null;recording.current=null;
      stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
      await bridge.active(false);
      setNotice('');setPhase(blob.current ? 'review' : 'idle');
      diag('error', `record failed: ${e?.message} ${JSON.stringify(startupTimings)}`);
      setError(`Could not start recording: ${e.message}. Try again or choose another source.`);
    }
  }

  async function togglePause() {
    const r = recording.current;
    if (!r) { setPaused(p => !p); return; }
    if(pausePending.current)return;pausePending.current=true;
    try{
      if (r.state === 'recording') { r.pause(); if(cameraRecording.current?.recorder.state==='recording')cameraRecording.current.recorder.pause(); pausedAt.current = performance.now(); setPaused(true); await captureSession.current?.setPaused?.(true); }
      else if (r.state === 'paused') { await captureSession.current?.setPaused?.(false); if(r.state!=='paused')return; r.resume(); if(cameraRecording.current?.recorder.state==='paused')cameraRecording.current.recorder.resume(); pausedFor.current += performance.now() - pausedAt.current; pausedAt.current = 0; setPaused(false); }
    }catch(e){setError(e.message);stop();}finally{pausePending.current=false;}
  }
  function discard() { discarding.current = true; stop(); }
  function restart() { discard(); /* TODO(codex): start again with the same source once the old capture has stopped. */ }

  function recordArea() {
    start(null, area);
  }

  async function save() {
    setPhase('saving'); setError('');
    try { const path = await bridge.save(new Uint8Array(await blob.current.arrayBuffer())); if (path) setSaved(path); }
    catch (e) { setError(`Could not save: ${e.message}. Your recording is still here, so try saving again.`); }
    finally { setPhase('review'); }
  }
  /**
   * Every finished recording lands in Recent recordings right away (a single recording, named by date).
   * Editor changes are then autosaved as edits only (autosaveEdits). Failure keeps the old behaviour:
   * the recording stays in memory and Save/Export still work.
   */
  async function autosaveRecording() {
    if (!bridge || !blob.current || projectInfo.current) return;
    const duration = clipDuration.current, asset = editorAsset.current;
    const edits = { ...reviewEdits({ duration, cursorFree: !!asset?.cursorFree, zooms: editorZooms(asset?.zoomTimeline) }), trim: { start: 0, end: duration } };
    const name = 'Recording ' + new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    try { await persistProject({ mode: 'single', name, edits }); }
    catch (e) { try { bridge.logDiagnostics?.('warn', `autosave failed: ${e?.message}`); } catch {} setNotice('This recording couldn’t be saved to Recent recordings. Save or export it to keep it.'); }
  }
  async function autosaveEdits(edits) {
    const id = projectInfo.current?.id;
    if (!bridge || !id) return false;
    await bridge.saveProjectEdits(id, edits); return true;
  }
  const autosaved = () => !!projectInfo.current?.id;
  function deleteRecording() {
    if (autosaved()) {
      if (!confirm('Delete this recording? It will also be removed from Recent recordings.')) return;
      bridge.deleteProject(projectInfo.current.id).catch(e => setError(`Could not delete: ${e.message}`));
    } else if (!saved && blob.current && !confirm('Delete this recording? It has not been saved.')) return;
    resetRecording();
  }
  // The finished modal's X: back to the toolbar. An autosaved recording stays in Recent recordings.
  function closeRecording() {
    if (!autosaved() && !saved && blob.current && !confirm('Close without saving? This recording and your edits will be discarded.')) return;
    resetRecording();
  }
  function resetRecording() {
    cameraBlob.current=null;
    if (previousUrl.current) URL.revokeObjectURL(previousUrl.current);
    previousUrl.current = ''; blob.current = null; setUrl(''); setSaved(''); setError(''); setExportOpen(false); setPhase('idle');
    projectInfo.current = null; editorAsset.current = null; editorSession.current = null; editorEdits.current = null; setEditorOpen(false);
    setExportNote(''); setPanel(null); setSeconds(0); clipDuration.current = 0; setPaused(false);
  }
  function openEditor() { setExportOpen(false); setEditorOpen(true); }
  const [originalUrl, setOriginalUrl] = useState('');
  const [cameraUrl,setCameraUrl]=useState('');
  useEffect(()=>{const next=cameraBlob.current?URL.createObjectURL(cameraBlob.current):'';setCameraUrl(next);return()=>{if(next)URL.revokeObjectURL(next);};},[url]);
  useEffect(() => {
    const original = editorAsset.current?.raw;
    const next = original ? URL.createObjectURL(original) : '';
    setOriginalUrl(next);
    return () => { if (next) URL.revokeObjectURL(next); };
  }, [url]);
  const editorRecording = useMemo(() => PREVIEW ? PREVIEW_EDITOR : {
    name: projectInfo.current?.name || 'Recording', url: originalUrl || url, duration: clipDuration.current, size: null, project: projectInfo.current?.projectName || null,
    windowCapture: editorAsset.current?.sourceId?.startsWith('window:') || false,
    events: editorAsset.current?.events || [], cursorFree: !!editorAsset.current?.cursorFree,
    clicks: (editorAsset.current?.events || []).filter(e => e.type === 'click').map(e => e.time / 1000),
    zooms: editorZooms(editorAsset.current?.zoomTimeline),
    camera:cameraUrl?{url:cameraUrl}:null,hasMic:!!editorAsset.current?.hasMic,
    fps: sourceFps.current || null, // capture cadence, shown in the timeline meta
  }, [url, originalUrl,cameraUrl]);
  const [folders, setFolders] = useState(bridge ? [] : PREVIEW_FOLDERS);
  const refreshRecents = async () => { const [list, dirs] = await Promise.all([bridge.listProjects(), bridge.listFolders()]); setRecents(list); setFolders(dirs); };
  useEffect(() => { if (bridge && panel === 'recents') refreshRecents().catch(e => setError(e.message)); }, [panel]);
  // Folder actions. Browser preview (no bridge) edits the sample lists in memory.
  const folderActions = bridge ? {
    onMove: async (item, folderId) => { await bridge.moveProject(item.id, folderId); await refreshRecents(); },
    onCreateFolder: async name => { const folder = await bridge.createFolder(name); await refreshRecents(); return folder; },
    onRenameFolder: async (folder, name) => { await bridge.renameFolder(folder.id, name); await refreshRecents(); },
    onDeleteFolder: async folder => { await bridge.deleteFolder(folder.id); await refreshRecents(); },
  } : {
    onMove: async (item, folderId) => setRecents(list => list.map(r => r.id === item.id ? { ...r, folderId } : r)),
    onCreateFolder: async name => { const folder = { id: crypto.randomUUID(), name }; setFolders(list => [...list, folder]); return folder; },
    onRenameFolder: async (folder, name) => setFolders(list => list.map(f => f.id === folder.id ? { ...f, name } : f)),
    onDeleteFolder: async folder => { setFolders(list => list.filter(f => f.id !== folder.id)); setRecents(list => list.map(r => r.folderId === folder.id ? { ...r, folderId: null } : r)); },
  };
  function saveProject() { openEditor(); setNotice('Use Save in the editor to save an editable recording or project.'); }
  async function persistProject({mode,name,edits}) {
    const asset=editorAsset.current;
    if(!blob.current) throw new Error('No recording is available.');
    const {raw,...metadata}=asset || {};
    const result=await bridge.saveProject({id:projectInfo.current?.id,mode,name,edits,
      asset:{...metadata,fps:sourceFps.current},camera:cameraBlob.current?new Uint8Array(await cameraBlob.current.arrayBuffer()):undefined,original:new Uint8Array(await (raw || blob.current).arrayBuffer()),preview:new Uint8Array(await blob.current.arrayBuffer())});
    projectInfo.current={...result,name:name || projectInfo.current?.name || 'Recording'};
    setRecents(await bridge.listProjects());return result;
  }
  async function renameProject(item, name) {
    const result = await bridge.renameProject(item.id, name);
    if (projectInfo.current?.id === item.id) projectInfo.current = { ...projectInfo.current, name: result.name, projectName: projectInfo.current.projectName ? result.name : null };
    setRecents(await bridge.listProjects());
  }
  async function deleteProject(item) {
    await bridge.deleteProject(item.id);
    // The open recording stays in memory; a later Save creates a new project instead of updating the deleted one.
    if (projectInfo.current?.id === item.id) projectInfo.current = null;
    setRecents(await bridge.listProjects());
  }
  async function reopenProject(item) {
    try {
      const doc=await bridge.openProject(item.id),edits=doc.edits;
      const original=new Blob([doc.original],{type:'video/webm'}),preview=new Blob([doc.preview],{type:'video/webm'});
      projectInfo.current={id:doc.id,name:doc.name,projectName:doc.kind==='project'?doc.name:null};
      editorAsset.current={...doc.asset,raw:original};blob.current=preview;clipDuration.current=edits.duration;
      cameraBlob.current=doc.camera?new Blob([doc.camera],{type:'video/webm'}):null;
      sourceFps.current=doc.asset?.fps ?? null;
      editorSession.current={...edits,selection:null,timeline:{time:edits.trim.start,playing:false,splits:edits.splits || [],removed:edits.removed || [],zooms:edits.zooms || [],trim:edits.trim},
        project:{name:projectInfo.current.projectName,savedAt:Date.parse(doc.updatedAt)},dirty:false,history:{past:[],future:[],lastKey:null,lastAt:0}};
      editorEdits.current=null;
      if(previousUrl.current)URL.revokeObjectURL(previousUrl.current);
      const next=URL.createObjectURL(preview);previousUrl.current=next;setOriginalUrl('');setUrl(next);
      setPanel(null);setError('');setSaved('');setExportOpen(false);setPhase('review');setEditorOpen(true);
    } catch(e) {setError('Could not open recording: '+e.message);}
  }
  async function runExport({ format, fps, quality, resolution = 'original', fileName = '', folder = null }) {
    const destination = 'file';
    if (!bridge || !blob.current) { setExportNote('Record a clip in the desktop app first.'); return; }
    if (exportBusy.current) return;
    exportBusy.current = true; exportCancelled.current = false;
    let succeeded = false;
    setExportedPath(null); setPhase('saving'); setExportNote(''); setExportProgress({ label: 'Preparing…', percent: 0 });
    try {
      let result;
      if (editorEdits.current || cameraBlob.current || editorAsset.current?.deferredEffects) {
        editorExportAbort.current = new AbortController();
        const input=editorEdits.current||editorAsset.current?.deferredEffects?editorRecording:{...editorRecording,url,cursorFree:false,events:[],clicks:[],zooms:[]};
        const edits=editorEdits.current || reviewEdits(input);
        result = await exportEditor(input, structuredClone(edits), { destination, format, fps, quality, resolution, fileName, folder }, bridge, editorExportAbort.current.signal, percent => setExportProgress({ label: 'Rendering…', percent }));
      } else {
        const bytes = new Uint8Array(await blob.current.arrayBuffer());
        if (exportCancelled.current) { setExportNote('Export cancelled. Your recording is still available.'); return; }
        result = await bridge.export(bytes, { destination, format, fps, quality, resolution, fileName, folder, duration: clipDuration.current });
      }
      if (result.canceled) setExportNote('Export cancelled. Your recording is still available.');
      else { succeeded = true; setExportedPath(result.filePath); setPhase('review'); setExportNote(`Saved as ${result.filePath.split(/[\\/]/).pop()}`); }
    } catch (error) { setExportNote(exportCancelled.current ? 'Export cancelled. Your recording and edits are still available.' : `Export failed: ${error.message}. Your recording is still available; try again.`); }
    finally { editorExportAbort.current = null; exportBusy.current = false; setExportProgress(null); if (!succeeded) setPhase('review'); }
  }
  function cancelExport() { exportCancelled.current = true; editorExportAbort.current?.abort(); setExportNote('Cancelling…'); bridge?.cancelExport().catch(error => setExportNote(error.message)); }

  const recordingNow = phase === 'recording' || phase === 'stopping';
  const { dockProps, gripProps } = useDockDrag(`${panel}|${!!notice}|${!!error}|${phase}`);
  const recordingSize = PREVIEW ? { width: 1920, height: 1080 } : null; // real size is read from the video in FinishedModal
  const preset = AREA_PRESETS.find(p => p.id === areaPreset);

  return (
    <main className="stage" data-preview={!bridge || undefined}>
      <UpdateAbout busy={busy} unsaved={!!url && !projectInfo.current?.id}/>
      {phase === 'review' || phase === 'saving' ? <>
        {editorOpen
          ? <Editor session={editorSession} recording={editorRecording} initial={PREVIEW?.startsWith('editor') ? PREVIEW : null}
              onBack={() => setEditorOpen(false)}
              onExport={(edits, size) => { editorEdits.current = edits; setExportSize(size || null); setExportNote(''); setExportOpen(true); }}
              onSaveProject={bridge ? persistProject : undefined} onAutosave={bridge ? autosaveEdits : undefined} />
          : <FinishedModal isOpen={!exportOpen} url={url} recording={editorAsset.current?.deferredEffects?editorRecording:null} cameraUrl={cameraUrl} seconds={clipDuration.current || seconds} name="Recording" size={recordingSize}
              busy={busy} saved={saved} error={error} canEdit={!!url || !!PREVIEW}
              onDelete={deleteRecording} onClose={closeRecording} onEditor={openEditor} onSaveProject={saveProject} onExport={() => { editorEdits.current = null; setExportSize(recordingSize); probeSize(url).then(s => s && setExportSize(s)); setExportNote(''); setExportOpen(true); }} />}
        <ExportModal exportedPath={exportedPath} sourceFps={sourceFps.current} size={exportSize} isOpen={exportOpen} onOpenChange={open => { if (!exportBusy.current) { setExportOpen(open); if (!open && exportedPath) { setExportedPath(null); resetRecording(); } } }} onExport={runExport} onCancel={cancelExport} busy={busy} note={exportNote} progress={exportProgress} />
      </> : recordingNow ? <>
        {cameraOn && <CameraBubble corner={cameraCorner} onCornerChange={setCameraCorner} stream={camera.stream} disconnected={camera.status === 'disconnected'} />}
        <div className="dock" {...dockProps}><RecordingHud seconds={seconds} paused={paused} stopping={phase === 'stopping'}
          onPauseToggle={togglePause} onRestart={restart} onDiscard={discard} onStop={stop} /></div>
      </> : <>
        {panel === 'area' && <AreaSelection rect={area} ratio={preset?.ratio}
          onChange={next => { setArea(next); }} scale={window.devicePixelRatio || 1} />}
        <div className="dock" {...dockProps}>
          {notice && <div role="status" className="toast">{notice}</div>}
          {error && <div role="alert" className="toast">{error}</div>}
          {panel === 'display' && <DisplayPicker displays={displays} selectedId={displayId} onSelect={setDisplayId} onRecord={() => start(displayId)} busy={busy || loading} />}
          {panel === 'window' && <WindowPicker windows={windows} selectedId={windowId} onSelect={setWindowId} onRecord={() => start(windowId)} busy={busy || loading} />}
          {panel === 'area' && <AreaPicker presetId={areaPreset} customSize={{ width: Math.round(area.width * (window.devicePixelRatio || 1)), height: Math.round(area.height * (window.devicePixelRatio || 1)) }}
            onSelect={id => { setAreaPreset(id); const p = AREA_PRESETS.find(x => x.id === id); if (p?.ratio) setArea(a => ({ ...a, height: Math.round(a.width / p.ratio) })); }}
            onRecord={recordArea} busy={busy} />}
          {panel === 'recents' && <RecentRecordings recordings={recents} folders={folders} {...folderActions} onOpen={reopenProject}
            onRename={bridge ? renameProject : async (item, name) => setRecents(list => list.map(r => r.id === item.id ? { ...r, name } : r))}
            onDelete={bridge ? deleteProject : async item => setRecents(list => list.filter(r => r.id !== item.id))} />}
          {panel === 'camera' && <CameraPicker {...camera} onSelect={id => inputs?inputs.select('camera',id):setCamera(c=>({...c,selectedId:id}))} onRetry={() => inputs?.retry('camera')} onOpenSettings={bridge?.openPrivacySettings ? () => bridge.openPrivacySettings('camera') : undefined} />}
          {panel === 'mic' && <MicPicker {...mic} onSelect={id => inputs?inputs.select('mic',id):setMic(m=>({...m,selectedId:id}))} onRetry={() => inputs?.retry('mic')} onOpenSettings={bridge?.openPrivacySettings ? () => bridge.openPrivacySettings('microphone') : undefined} />}
          <div className="dock__bar">
            <RecordToolbar activePanel={panel} onPanelChange={setPanel} gripProps={gripProps}
              cameraOn={cameraOn} cameraName={camera.devices.find(d => d.id === camera.selectedId)?.name}
              micOn={micOn} micName={mic.devices.find(d => d.id === mic.selectedId)?.name}
              autoZoom={autoZoom} onAutoZoomChange={setAutoZoom}
              smoothCursor={smoothCursor} onSmoothCursorChange={setSmoothCursor}
              onClose={() => window.close()} disabled={phase === 'starting'} />
          </div>
          {/* First-run tips point at the toolbar; they wait while a picker, error or start-up is showing. */}
          <Tips set="toolbar" active={!panel && !error && phase === 'idle'} />
        </div>
      </>}
    </main>
  );
}


createRoot(document.getElementById('root')).render(<App />);
