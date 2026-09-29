const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createUpdater}=require('../electron/updater.cjs');
function fixture({packaged=true,platform='win32',safe=true}={}){
 const fake=new EventEmitter();let loads=0,checks=0,installs=0;const states=[];
 fake.checkForUpdates=async()=>{checks++;fake.emit('checking-for-update');return {};};
 fake.quitAndInstall=(silent,relaunch)=>{assert.equal(silent,false);assert.equal(relaunch,true);installs++;};
 const service=createUpdater({app:{isPackaged:packaged,getVersion:()=> '0.1.0'},platform,loadUpdater:()=>{loads++;return fake;},notify:s=>states.push(s),canInstall:()=>safe});
 return {service,fake,states,counts:()=>({loads,checks,installs})};
}
test('development and non-Windows never load updater, check network or install',async()=>{
 for(const options of [{packaged:false},{platform:'darwin'}]){
  const f=fixture(options);await f.service.start();await f.service.check();
  assert.equal(f.service.getState().status,'disabled');assert.deepEqual(f.counts(),{loads:0,checks:0,installs:0});assert.throws(()=>f.service.install());
 }
});
test('startup and manual checks, status/progress, release notes and explicit install',async()=>{
 const f=fixture();await f.service.start();assert.equal(f.counts().checks,1);
 assert.equal(f.fake.autoDownload,true);assert.equal(f.fake.autoInstallOnAppQuit,false);assert.equal(f.fake.allowDowngrade,false);
 f.fake.emit('update-not-available');assert.equal(f.service.getState().status,'up-to-date');
 await f.service.check();assert.equal(f.counts().checks,2);
 f.fake.emit('update-available',{version:'0.1.1',releaseNotes:'<p>Improved recording.</p>'});
 assert.equal(f.service.getState().status,'available');
 f.fake.emit('download-progress',{percent:34.5});assert.equal(f.service.getState().percent,34.5);
 f.fake.emit('update-downloaded',{version:'0.1.1'});assert.equal(f.service.getState().notes,'Improved recording.');
 await f.service.check();assert.equal(f.counts().checks,2);assert.equal(f.counts().installs,0);
 f.service.install();assert.equal(f.counts().installs,1);assert.throws(()=>f.service.install());
});
test('working/unsaved state blocks install even after download',async()=>{
 const f=fixture({safe:false});await f.service.start();f.fake.emit('update-downloaded',{version:'0.1.1'});
 assert.throws(()=>f.service.install(),/save or close/);assert.equal(f.counts().installs,0);
});
test('duplicate checks are coalesced and network errors allow retry',async()=>{
 const f=fixture();let reject;f.fake.checkForUpdates=()=>new Promise((_,r)=>reject=r);
 const first=f.service.check();await Promise.resolve();await f.service.check();assert.equal(f.counts().loads,1);
 reject(Error('secret server URL'));await first;assert.equal(f.service.getState().status,'error');assert(!f.service.getState().error.includes('secret'));
 f.fake.checkForUpdates=async()=>f.fake.emit('update-not-available');await f.service.check();assert.equal(f.service.getState().status,'up-to-date');
});
test('background download failures are caught after check resolves',async()=>{
 const f=fixture();let reject;f.fake.checkForUpdates=async()=>({downloadPromise:new Promise((_,r)=>reject=r)});
 await f.service.check();reject(Error('download interrupted'));await new Promise(r=>setImmediate(r));assert.equal(f.service.getState().status,'error');
});
test('packaging uses NSIS and an explicit token-free public feed',()=>{
 const pkg=require('../package.json');assert.equal(pkg.build.win.target[0].target,'nsis');
 const feed=pkg.build.publish[0];assert.equal(feed.provider,'github');assert.equal(feed.repo,'nova');assert.equal(feed.private,false);assert.equal(feed.token,undefined);
 assert.match(pkg.version,/^\d+\.\d+\.\d+$/);assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false);
});
