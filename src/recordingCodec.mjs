// Chromium's H.264 recorder can round odd dimensions down after its first frame.
// VP9/VP8 retain those edge pixels; normal even-sized sources keep the existing preference.
export function recordingMime({width,height,hasMic},supports){
  const codecs=width%2||height%2?['vp9','vp8']:['h264','vp9','vp8'];
  return codecs.map(codec=>`video/webm;codecs=${codec}${hasMic?',opus':''}`).find(supports);
}
