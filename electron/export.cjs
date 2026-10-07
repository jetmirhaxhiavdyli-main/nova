const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const unpack = value => value.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const ffmpeg = unpack(require('ffmpeg-static'));
const ffprobe = unpack(require('ffprobe-static').path);
const PRESETS = {
  source: { h264: 16, vp9: 18, colors: 256, dither: 'sierra2_4a' },
  // With `slow`, CRF +2 matched the old `fast` quality (VMAF) at 5–15% smaller files.
  social: { h264: 24, vp9: 28, colors: 192, dither: 'bayer:bayer_scale=2' },
  web: { h264: 30, vp9: 36, colors: 128, dither: 'bayer:bayer_scale=3' },
  'web-low': { h264: 36, vp9: 44, colors: 64, dither: 'bayer:bayer_scale=5' },
};
function validate(options) {
  if (!options || options.destination !== 'file' || !['MP4', 'GIF', 'WebM'].includes(options.format) || !(options.format==='GIF'?[10,15,20,24,30,50,60]:[24,30,50,60]).includes(options.fps) || !Object.hasOwn(PRESETS, options.quality)) throw new Error('Invalid export settings.');
  if(!['original','1080p','720p','custom',...(options.format==='GIF'?['480p']:[])].includes(options.resolution??'original')) throw new Error('Invalid export resolution.');
  if(options.resolution==='custom'&&![options.customSize?.width,options.customSize?.height].every(n=>Number.isInteger(n)&&n>=16&&n<=8192)) throw new Error('Invalid custom export size.');
  return options;
}
function run(binary, args, { signal, onData } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Export cancelled.'));
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = '';
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-1000000); onData?.(String(data)); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-6000); });
    child.on('error', error => { signal?.removeEventListener('abort', abort); reject(error); });
    child.on('close', code => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(new Error('Export cancelled.'));
      else if (code !== 0) reject(new Error(stderr || `Encoder exited with code ${code}.`));
      else resolve(stdout);
    });
  });
}
async function probe(file, signal) {
  const gifTiming = path.extname(file).toLowerCase() === '.gif' ? ['-min_delay','0'] : [];
  const data = JSON.parse(await run(ffprobe, ['-v','error',...gifTiming,'-show_streams','-show_format','-of','json',file], { signal }));
  const video = data.streams.find(s => s.codec_type === 'video');
  if (!video) throw new Error('The recording has no video track.');
  return { ...video, duration: Number(data.format.duration || video.duration) };
}
// Tuned for screen content (VMAF-benchmarked on real recordings):
// x264 `slow` + 10 s keyframe interval; VP9 row-mt, tiles and screen-content tuning.
function codecArgs(options,width,height) {
  const preset=PRESETS[options.quality],pix=width%2||height%2?'yuv444p':'yuv420p',gop=String((options.fps||30)*10);
  return options.format==='MP4'
    // Benchmarked on a screen-style clip: `slower` + `-tune animation` at CRF+1 is smaller and measurably sharper than `slow` at the old CRF.
    ? ['-c:v','libx264','-preset','slower','-tune','animation','-crf',String(preset.h264+1),'-g',gop,'-profile:v','high','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart']
    : ['-c:v','libvpx-vp9','-deadline','good','-cpu-used','2','-row-mt','1','-tile-columns','2','-tune-content','screen','-crf',String(preset.vp9),'-b:v','0','-g',gop,'-pix_fmt',pix,'-c:a','libopus','-b:a','128k'];
}
// Editor frames are RGB: convert to BT.709 with accurate chroma (sharper coloured text) and tag it so players don't shift colours.
const RGB_TO_BT709='scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int';
const BT709_TAGS=['-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-color_range','tv'];
async function encode(input, output, options, { signal, onProgress = () => {}, durationHint = 0 } = {}) {
  validate(options);
  const info = await probe(input, signal), preset = PRESETS[options.quality];
  const duration = info.duration > 0 ? info.duration : durationHint;
  let buffer = '';
  const progress = (offset, scale) => data => {
    buffer += data;
    const lines = buffer.split('\n'); buffer = lines.pop();
    for (const line of lines) if (line.startsWith('out_time_us=') && duration > 0) onProgress(Math.min(99, Math.round(offset + Number(line.slice(12)) / 1000000 / duration * scale)));
  };
  const common = ['-hide_banner','-loglevel','error','-nostdin','-y','-i',input];
  const {resolutionFilters}=await import('./exportGeometry.mjs');
  const {filters,output:dimensions}=resolutionFilters(info,options);
  const fps = [`fps=${options.fps}`,...filters].join(',');
  if (options.format === 'GIF') {
    // Two passes avoid buffering the whole clip while generating the palette.
    const palette = path.join(path.dirname(output), 'palette.png');
    await run(ffmpeg, [...common,'-vf',`${fps},palettegen=max_colors=${preset.colors}:reserve_transparent=0`,'-frames:v','1','-threads','1','-progress','pipe:1',palette], { signal, onData: progress(0,35) });
    await run(ffmpeg, [...common,'-i',palette,'-lavfi',`[0:v]${fps}[v];[v][1:v]paletteuse=dither=${preset.dither}`,'-an','-loop','0','-fps_mode','passthrough','-progress','pipe:1',output], { signal, onData: progress(35,64) });
  } else {
    // MP4 players expect 4:2:0; pad odd dimensions without scaling or cropping.
    const filter = fps;
    const codec = codecArgs(options,dimensions.width,dimensions.height);
    await run(ffmpeg, [...common,'-map','0:v:0','-map','0:a?','-vf',filter,...codec,'-progress','pipe:1',output], { signal, onData: progress(0,99) });
  }
  if (!(await fs.stat(output)).size) throw new Error('The exported file is empty.');
  onProgress(100);
}
/** Presentation time (seconds) of every video frame, in order. A recording's frame spacing is uneven, and the editor export needs the real times. */
async function frameTimes(file, signal) {
  const text = await run(ffprobe, ['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time','-of','csv=p=0',file], { signal });
  return text.split(String.fromCharCode(10)).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
}
module.exports = { validate, encode, probe, frameTimes, run, ffmpeg, PRESETS, codecArgs, RGB_TO_BT709, BT709_TAGS };
