const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createScreenshot}=require('../electron/screenshot.cjs');
function setup({scale=1.5,allowed=true,grab}={}){
  const display={id:1,bounds:{x:0,y:0,width:1280,height:720},size:{width:1280,height:720},scaleFactor:scale};
  const log={requested:null,written:[],crops:[],events:[],saved:[]};
  const mk=tag=>({toPNG:()=>Buffer.from(tag),getSize:()=>({width:300,height:150}),crop:r=>{log.crops.push(['inner',r]);return mk('inner');},tag});
  const cropped=mk('png');
  const image={isEmpty:()=>false,getSize:()=>({width:1920,height:1080}),crop:r=>{log.crops.push(r);return cropped;},toJPEG:q=>Buffer.from('jpeg'+q)};
  const win={owns:s=>s==='mine',arm:async d=>log.events.push(['arm',d.id]),frame:f=>log.events.push(['frame',f.width,f.height]),
    preview:p=>log.events.push(['preview',p.width,p.height]),update:u=>log.events.push(['update',u.width,u.height,u.edited]),hide:()=>log.events.push(['hide'])};
  const shot=createScreenshot({
    screen:{getCursorScreenPoint:()=>({x:10,y:10}),getDisplayNearestPoint:()=>display,getAllDisplays:()=>[display]},
    desktopCapturer:{getSources:async o=>{log.requested=o;return grab?grab():[{id:'screen:0:0',display_id:'1',thumbnail:image}];}},
    clipboard:{writeImage:async i=>log.written.push(i)},win,canStart:()=>allowed,
    save:async png=>{log.saved.push(png);return 'C:\\shot.png';},
  });
  return {shot,log};
}
const view={width:1280,height:720};
test('dims at once, grabs at physical size, then sends the frozen frame',async()=>{
  const {shot,log}=setup();
  assert.equal(await shot.start(),true);
  assert.deepEqual(log.requested,{types:['screen'],thumbnailSize:{width:1920,height:1080}});
  assert.deepEqual(log.events,[['arm',1],['frame',1280,720]]);
  assert.ok(shot.owns('mine'));assert.ok(!shot.owns('other'));
  assert.equal(await shot.start(),false); // a second press while selecting does nothing
});
test('selection is mapped to image px, copied, and shown in the preview',async()=>{
  const {shot,log}=setup();
  await shot.start();
  assert.deepEqual(await shot.finish({x:100,y:50,width:200,height:100},view),{width:300,height:150});
  assert.deepEqual(log.crops,[{x:150,y:75,width:300,height:150}]);
  assert.equal(log.written.length,1);
  assert.deepEqual(log.events.at(-1),['preview',300,150]);
});
test('preview Copy re-copies and Save passes the PNG; a new press replaces the preview',async()=>{
  const {shot,log}=setup();
  await shot.start();await shot.finish({x:0,y:0,width:100,height:100},view);
  assert.equal(await shot.copy(),true);assert.equal(log.written.length,2);
  assert.equal(await shot.save(),'C:\\shot.png');assert.equal(log.saved[0].toString(),'png');
  assert.equal(await shot.start(),true); // replaces the preview
  assert.deepEqual(log.events.filter(e=>e[0]==='hide').length,1);
  assert.equal(await shot.copy(),false); // nothing to copy until a new selection
});
test('tiny selections, cancel, failed grabs and blocked starts leave the clipboard alone',async()=>{
  let {shot,log}=setup();
  await shot.start();
  assert.equal(await shot.finish({x:5,y:5,width:1,height:1},view),null);
  assert.equal(log.written.length,0);assert.deepEqual(log.events.at(-1),['hide']);
  ({shot,log}=setup());
  await shot.start();shot.cancel();
  assert.equal(await shot.finish({x:0,y:0,width:50,height:50},view),null);assert.equal(log.written.length,0);
  ({shot,log}=setup({grab:()=>[]}));
  assert.equal(await shot.start(),false);assert.deepEqual(log.events.at(-1),['hide']); // no source: the dim is removed again
  ({shot}=setup({allowed:false}));
  assert.equal(await shot.start(),false); // e.g. while recording
});
test('cancelling while the grab is still running shows no frame',async()=>{
  let release;const {shot,log}=setup({grab:()=>new Promise(r=>{release=()=>r([]);})});
  const started=shot.start();
  await new Promise(r=>setTimeout(r,5));
  shot.cancel();release();
  assert.equal(await started,false);
  assert.ok(!log.events.some(e=>e[0]==='frame'));
});
test('cropping the preview copies the result; reset restores the first selection; bad rects are rejected',async()=>{
  const {shot,log}=setup();
  await shot.start();await shot.finish({x:100,y:50,width:200,height:100},view);
  assert.deepEqual(await shot.crop({x:10,y:10,width:100,height:50}),{width:300,height:150}); // the fake image reports a fixed size
  assert.deepEqual(log.crops.at(-1),['inner',{x:10,y:10,width:100,height:50}]);
  assert.equal(log.written.length,2);
  assert.deepEqual(log.events.at(-1),['update',300,150,true]);
  assert.deepEqual(await shot.crop(null),{width:300,height:150}); // back to the original
  assert.deepEqual(log.events.at(-1),['update',300,150,false]);
  for(const bad of [{x:-1,y:0,width:10,height:10},{x:0,y:0,width:1,height:10},{x:250,y:0,width:100,height:10},{x:0,y:0,width:10.5,height:10}])assert.equal(await shot.crop(bad),null);
  assert.equal(log.written.length,3); // rejected crops copy nothing
});
