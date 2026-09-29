export function outputSize(size, resolution, format) {
  if (!size?.width || !size?.height) return null;
  let {width,height}=size;
  const bounds={'1080p':[1920,1080],'720p':[1280,720],'480p':[640,480]}[resolution];
  if(bounds) {
    const [bw,bh]=height>width?[bounds[1],bounds[0]]:bounds;
    const k=Math.min(1,bw/width,bh/height);
    width=Math.max(1,Math.round(width*k));height=Math.max(1,Math.round(height*k));
  }
  if(format==='MP4'){width+=width%2;height+=height%2;}
  return {width,height};
}
export function resolutionFilters(size,options) {
  const scaled=outputSize(size,options.resolution),output=outputSize(size,options.resolution,options.format);
  const filters=[];
  if(scaled.width!==size.width||scaled.height!==size.height)
    filters.push(`scale=${scaled.width}:${scaled.height}:flags=lanczos`,'setsar=1');
  if(options.format==='MP4')filters.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
  return {filters,output};
}
