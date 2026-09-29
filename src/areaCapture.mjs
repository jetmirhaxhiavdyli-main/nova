import { createZoomMotion } from './autoZoom.mjs';
import { validPoint } from './zoomTimeline.mjs';
import { createCursorMotion, drawCursor } from './cursorMotion.mjs';
import { captureDeadline } from './captureDeadline.mjs';
import {cropPixels} from '../electron/captureGeometry.mjs';
export {cropPixels} from '../electron/captureGeometry.mjs';

export async function createAreaCapture(source, selection, { onClick, onPointer, onActivity, onMotion, zoomEnabled = true, cursorEnabled = !!onPointer, cursorScale = 1, clock = () => performance.now(), isPaused = () => false, fps = 30 } = {}) {
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.srcObject = source;
  let timer, output, unsubscribe, unsubscribePointer, unsubscribeActivity;
  const dispose = () => {
    clearInterval(timer);
    unsubscribe?.();
    unsubscribePointer?.();
    unsubscribeActivity?.();
    output?.getTracks().forEach(track => track.stop());
    video.pause(); video.srcObject = null;
  };
  try {
    await captureDeadline(video.play(),10000,'The recording surface did not start.',dispose);
    const crop = selection ? cropPixels(selection.area, selection.geometry, selection.viewport, { width: video.videoWidth, height: video.videoHeight }) : { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
    const motion = createZoomMotion({enabled:zoomEnabled});
    const cursor = createCursorMotion();
    unsubscribe = onClick?.(point => {
      if (!isPaused()) {
        const time = clock(), x = (point.x * video.videoWidth - crop.x) / crop.width, y = (point.y * video.videoHeight - crop.y) / crop.height;
        if (!validPoint(x,y)) return;
        motion.click(x, y, time);
        onMotion?.({ type: 'click', x, y, time });
      }
    });
    unsubscribePointer = onPointer?.(point => {
      if (isPaused()) return;
      const time = clock(), x = (point.x * video.videoWidth - crop.x) / crop.width, y = (point.y * video.videoHeight - crop.y) / crop.height;
      const mapped = point.visible !== false && x >= 0 && x <= 1 && y >= 0 && y <= 1 ? {x,y,visible:true} : {visible:false};
      if (cursorEnabled) cursor.move(mapped, time);
      motion.pointer(mapped, time); onMotion?.({type:'pointer',...mapped,time});
    });
    unsubscribeActivity = onActivity?.(activity => {
      if (isPaused()) return;
      const time=clock(),x=(activity.x*video.videoWidth-crop.x)/crop.width,y=(activity.y*video.videoHeight-crop.y)/crop.height;
      if (!validPoint(x,y) || !['typing','scroll'].includes(activity.kind)) return;
      motion.activity(activity.kind,x,y,time);
      onMotion?.({type:'activity',kind:activity.kind,x,y,time});
    });
    const canvas = document.createElement('canvas');
    canvas.width = crop.width; canvas.height = crop.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not create the area recording surface.');
    const draw = () => {
      const zoom = motion.frame(clock());
      context.drawImage(video, crop.x + zoom.x * crop.width, crop.y + zoom.y * crop.height, crop.width * zoom.width, crop.height * zoom.height, 0, 0, crop.width, crop.height);
      const pointer = cursor.frame(clock());
      if (pointer) drawCursor(context, (pointer.x - zoom.x) * crop.width / zoom.width, (pointer.y - zoom.y) * crop.height / zoom.height, 24 * cursorScale / zoom.width);
    };
    draw();
    // One composite per output frame at the recording rate (30 or 60 fps).
    output = canvas.captureStream(fps);
    timer = setInterval(()=>{if(!isPaused())draw();}, 1000 / fps);
    return { stream: output, dispose, zoomTimeline: duration => motion.snapshot(duration) };
  } catch (error) { dispose(); throw error; }
}
