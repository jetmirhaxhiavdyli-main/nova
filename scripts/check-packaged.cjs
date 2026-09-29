const {_electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),os=require('node:os');
(async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-packaged-check-'));
 const application=await _electron.launch({executablePath:path.resolve(__dirname,'../release',require('../package.json').version,'win-unpacked/Nova.exe'),args:['--user-data-dir='+profile],env:Object.fromEntries(Object.entries(process.env).filter(([k])=>k!=='ELECTRON_RUN_AS_NODE'))});
 try{
  const page=await application.firstWindow();await page.locator('.toolbar').waitFor();
  await page.getByRole('button',{name:'About and updates',exact:true}).click();await page.getByRole('dialog',{name:'About Nova'}).waitFor();
  const state=await page.evaluate(()=>window.recorder.updateState());assert(state.enabled);assert.equal(state.currentVersion,require('../package.json').version);
  const result=await application.evaluate(async({app})=>{
   const root=app.getAppPath(),require=process.getBuiltinModule('module').createRequire(root+'/package.json'),{pathToFileURL}=require('node:url');
   require(root+'/node_modules/uiohook-napi');
   const windows=require(root+'/node_modules/get-windows/index.js');
   const capture=require(root+'/node_modules/@screen-capture/node/dist/index.mjs');
   const {run,ffmpeg}=require(root+'/electron/export.cjs');
   return {packaged:app.isPackaged,nativeCapture:capture.isSupported(),windowApi:typeof windows.activeWindow,ffmpeg:(await run(ffmpeg,['-version'])).split('\n')[0]};
  });
  assert(result.packaged);assert(result.nativeCapture);assert.equal(result.windowApi,'function');assert.match(result.ffmpeg,/ffmpeg version/);
  console.log('Packaged About/updater, native modules and ffmpeg passed.',result,state.status);
 }finally{await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await application.close();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
