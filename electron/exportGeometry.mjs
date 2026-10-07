const even=(n,format)=>format==='MP4'?n+n%2:n;
const validBox=c=>c?.width>0&&c?.height>0;
// 'custom' outputs exactly the user's width x height: the video is fitted inside (aspect kept) and letterboxed.
export function outputSize(size, resolution, format, custom) {
  if (!size?.width || !size?.height) return null;
  if (resolution==='custom'&&validBox(custom)) return {width:even(custom.width,format),height:even(custom.height,format)};
  let {width,height}=size;
  const bounds={'1080p':[1920,1080],'720p':[1280,720],'480p':[640,480]}[resolution];
  if(bounds) {
    const [bw,bh]=height>width?[bounds[1],bounds[0]]:bounds;
    const k=Math.min(1,bw/width,bh/height);
    width=Math.max(1,Math.round(width*k));height=Math.max(1,Math.round(height*k));
  }
  return {width:even(width,format),height:even(height,format)};
}
export function resolutionFilters(size,options) {
  const output=outputSize(size,options.resolution,options.format,options.customSize);
  const filters=[];
  if(options.resolution==='custom'&&validBox(options.customSize)) {
    const k=Math.min(output.width/size.width,output.height/size.height);
    const w=Math.max(1,Math.min(output.width,Math.round(size.width*k))),h=Math.max(1,Math.min(output.height,Math.round(size.height*k)));
    if(w!==size.width||h!==size.height)filters.push(`scale=${w}:${h}:flags=lanczos`);
    filters.push(`pad=${output.width}:${output.height}:(ow-iw)/2:(oh-ih)/2:black`,'setsar=1');
    return {filters,output};
  }
  const scaled=outputSize(size,options.resolution);
  if(scaled.width!==size.width||scaled.height!==size.height)
    filters.push(`scale=${scaled.width}:${scaled.height}:flags=lanczos`,'setsar=1');
  if(options.format==='MP4')filters.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
  return {filters,output};
}
