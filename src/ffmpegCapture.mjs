// Records the screen by encoding frames in the main process with ffmpeg (constant frame rate, x264 CRF) instead of
// canvas + MediaRecorder. The result mimics the bits of the MediaRecorder API that the recording flow uses.
export async function createFfmpegCapture(bridge, sourceId, onEnded, fps = 30, selection = null) {
  const session = await bridge.nativeCaptureStart(sourceId, fps, crypto.randomUUID(), selection, true);
  let disposed = false, heartbeat;
  const command = type => bridge.nativeCaptureCommand(session.id, type);
  const dispose = () => { if (disposed) return; disposed = true; clearInterval(heartbeat); void bridge.nativeCaptureStop(session.id).catch(() => {}); };
  // A dead encoder or capture process is reported by the next ping.
  heartbeat = setInterval(() => { command('ping').catch(error => { if (!disposed) { dispose(); onEnded?.(error); } }); }, 3000);
  return {
    encoded: true, sourceSize: session.sourceSize, crop: session.crop, dispose,
    stream: { getTracks: () => [], getVideoTracks: () => [{}] }, // nothing to render: frames go straight to the encoder
    setPaused: paused => command(paused ? 'pause' : 'resume'),
    go: () => command('go'),
    finish: audio => bridge.nativeCaptureFinish(session.id, audio),
  };
}

/** MediaRecorder-shaped wrapper: start/pause/resume/stop and `onstop`/`ondataavailable`/`onerror`. Mic audio is recorded separately and muxed in. */
export function encodedRecorder(capture, micTracks = []) {
  const audioChunks = [];
  const audio = micTracks.length ? new MediaRecorder(new MediaStream(micTracks), { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 }) : null;
  if (audio) audio.ondataavailable = e => { if (e.data.size) audioChunks.push(e.data); };
  const recorder = {
    state: 'inactive', stoppedAt: 0, videoBitsPerSecond: 0, onstop: null, onerror: null, ondataavailable: null,
    start() { recorder.state = 'recording'; audio?.start(1000); capture.go().catch(error => recorder.onerror?.(error)); },
    pause() { audio?.pause(); recorder.state = 'paused'; },
    resume() { audio?.resume(); recorder.state = 'recording'; },
    stop() {
      if (recorder.state === 'inactive') return;
      recorder.state = 'inactive'; recorder.stoppedAt = performance.now();
      (async () => {
        try {
          if (audio && audio.state !== 'inactive') await new Promise(resolve => { audio.onstop = resolve; audio.stop(); });
          const micBytes = audioChunks.length ? new Uint8Array(await new Blob(audioChunks).arrayBuffer()) : null;
          const bytes = await capture.finish(micBytes);
          recorder.ondataavailable?.({ data: new Blob([bytes], { type: 'video/webm' }) });
        } catch (error) { recorder.onerror?.(error); }
        recorder.onstop?.();
      })();
    },
  };
  return recorder;
}
