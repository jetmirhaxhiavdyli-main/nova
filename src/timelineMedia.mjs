// Real timeline media from the recording: voice peaks (with a speech flag) and filmstrip thumbnails.

/**
 * Peaks from decoded PCM channels. Returns `buckets` entries of { peak (0–1, normalised to the loudest), speech }.
 * Speech = the bucket's RMS clearly above the recording's noise floor (its 20th-percentile RMS).
 */
export function peaksFromChannels(channels, buckets = 600) {
  const length = channels[0]?.length || 0;
  if (!length || !buckets) return [];
  const size = Math.max(1, Math.floor(length / buckets)), n = Math.min(buckets, Math.ceil(length / size));
  const peaks = new Float32Array(n), rms = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    const from = b * size, to = Math.min(length, from + size);
    let peak = 0, sum = 0;
    for (let i = from; i < to; i++) {
      let v = 0;
      for (const ch of channels) v += ch[i];
      v = Math.abs(v / channels.length);
      if (v > peak) peak = v;
      sum += v * v;
    }
    peaks[b] = peak; rms[b] = Math.sqrt(sum / Math.max(1, to - from));
  }
  const loudest = Math.max(1e-4, ...peaks);
  const floor = [...rms].sort((a, b) => a - b)[Math.floor(n * 0.2)] || 0;
  const threshold = Math.max(0.01, floor * 3);
  return Array.from(peaks, (p, b) => ({ peak: Math.min(1, p / loudest), speech: rms[b] > threshold }));
}

/** Decode the recording's audio track and return peaks, or [] when there is no audio. */
export async function loadVoicePeaks(url, { buckets = 600, signal } = {}) {
  const bytes = await (await fetch(url, { signal })).arrayBuffer();
  if (signal?.aborted) return [];
  const ctx = new AudioContext();
  try {
    const audio = await ctx.decodeAudioData(bytes);
    const channels = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, i) => audio.getChannelData(i));
    return peaksFromChannels(channels, buckets);
  } catch { return []; } // no audio track, or undecodable
  finally { ctx.close().catch(() => {}); }
}

/** Evenly spaced JPEG frames (data URLs; the CSP allows data: images) for the clip row. */
export async function loadThumbnails(url, duration, { count = 16, height = 56, signal } = {}) {
  if (!url || !(duration > 0)) return [];
  const video = document.createElement('video');
  video.muted = true; video.preload = 'auto'; video.src = url;
  const once = (event) => new Promise((resolve, reject) => {
    const ok = () => { clean(); resolve(); }, bad = () => { clean(); reject(Error('Thumbnail decode failed')); };
    const timer = setTimeout(bad, 15000);
    const clean = () => { clearTimeout(timer); video.removeEventListener(event, ok); video.removeEventListener('error', bad); };
    video.addEventListener(event, ok, { once: true }); video.addEventListener('error', bad, { once: true });
  });
  try {
    await once('loadeddata');
    const width = Math.max(1, Math.round(height * (video.videoWidth || 16) / (video.videoHeight || 9)));
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
    const c = canvas.getContext('2d');
    const frames = [];
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;
      const t = Math.min(duration - 0.05, (i + 0.5) / count * duration);
      const seeked = once('seeked'); video.currentTime = Math.max(0, t); await seeked;
      c.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ t, src: canvas.toDataURL('image/jpeg', 0.7) });
    }
    return frames;
  } catch { return []; }
  finally { video.removeAttribute('src'); video.load(); }
}
