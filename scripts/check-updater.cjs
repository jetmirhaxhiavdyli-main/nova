// End-to-end IPC/UI check with a fake feed; never downloads or installs anything.
if(!process.versions.electron){const child=require('node:child_process').spawn(require('electron'),[__filename],{windowsHide:true,stdio:'inherit',env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});child.on('exit',code=>process.exit(code??1));return;}
const {app}=require('electron'),{EventEmitter}=require('node:events'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-update-ui-'));app.setPath('userData',profile);
 const fake=new EventEmitter();let checks=0,installs=0;
 fake.checkForUpdates=async()=>{checks++;fake.emit('checking-for-update');fake.emit('update-not-available');return {};};
 fake.quitAndInstall=()=>installs++;
 const module=require('../electron/updater.cjs'),original=module.createUpdater;
 module.createUpdater=options=>original({...options,app:{isPackaged:true,getVersion:()=> '0.1.0'},platform:'win32',loadUpdater:()=>fake});
 const loaded=new Promise(resolve=>app.once('browser-window-created',(_,w)=>w.webContents.once('did-finish-load',()=>resolve(w))));
 require('../electron/main.cjs');const win=await loaded;
 const evaluate=fn=>win.webContents.executeJavaScript(`(${fn.toString()})()`,true);
 try{
  await evaluate(async()=>{await new Promise(r=>setTimeout(r,250));window.dispatchEvent(new Event('show-about'));await new Promise(r=>setTimeout(r,150));});
  assert.match(await evaluate(()=>document.body.innerText),/About Nova/);assert.match(await evaluate(()=>document.body.innerText),/0.1.0/);
  await evaluate(()=>window.recorder.checkForUpdates());assert(checks>=2);
  fake.emit('update-available',{version:'0.1.1',releaseNotes:'<b>Better recording</b>'});fake.emit('download-progress',{percent:42});
  await evaluate(()=>new Promise(r=>setTimeout(r,80)));assert.match(await evaluate(()=>document.body.innerText),/42%/);
  fake.emit('update-downloaded',{version:'0.1.1',releaseNotes:'Better recording'});
  await evaluate(()=>new Promise(r=>setTimeout(r,80)));assert.match(await evaluate(()=>document.body.innerText),/Restart & update/);assert.equal(installs,0);
  await evaluate(()=>window.recorder.updateActivity({busy:true,unsaved:true}));
  await assert.rejects(evaluate(()=>window.recorder.installUpdate()),/save or close/);assert.equal(installs,0);
  await evaluate(()=>window.recorder.updateActivity({busy:false,unsaved:false}));await evaluate(()=>window.recorder.installUpdate());assert.equal(installs,1);
  console.log('About UI, version, manual check, progress, notes, IPC guards and explicit install passed (mock updater).');
  win.destroy();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});app.exit(0);
 }catch(error){console.error(error);win.destroy();app.exit(1);}
})().catch(error=>{console.error(error);app.exit(1);});
