/** Main-process updater. No updater instance or network activity in development. */
function createUpdater({app,platform=process.platform,loadUpdater=()=>require('electron-updater').autoUpdater,notify=()=>{},canInstall=()=>true,log=null}) {
  const enabled=app.isPackaged&&platform==='win32';
  let state={status:enabled?'idle':'disabled',enabled,currentVersion:app.getVersion(),version:null,notes:'',percent:0,error:null};
  let updater,pending=null,installing=false;
  const publish=patch=>{state={...state,...patch};if(patch.status&&patch.status!=='downloading')log?.info(`updater: ${patch.status}${state.version?' '+state.version:''}${state.error?' · '+state.error:''}`);notify({...state});};
  const notes=value=>{
    const text=Array.isArray(value)?value.map(n=>`${n.version||''}\n${n.note||''}`).join('\n\n'):typeof value==='string'?value:'';
    return text.replace(/<[^>]*>/g,'').slice(0,16000);
  };
  const fail=()=>publish({status:'error',error:'Could not check or download the update. Check your connection and try again.'});
  function init(){
    if(updater)return updater;
    updater=loadUpdater();
    if(log)updater.logger=log; // electron-updater's own detailed steps (download, verify, spawn installer) go to the diagnostics log
    updater.autoDownload=true;
    updater.autoInstallOnAppQuit=false;
    updater.allowPrerelease=false;updater.allowDowngrade=false;
    updater.on('checking-for-update',()=>publish({status:'checking',error:null}));
    updater.on('update-available',info=>publish({status:'available',version:info.version,notes:notes(info.releaseNotes),percent:0,error:null}));
    updater.on('update-not-available',()=>publish({status:'up-to-date',version:null,notes:'',error:null}));
    updater.on('download-progress',p=>publish({status:'downloading',percent:Math.max(0,Math.min(100,Number(p.percent)||0))}));
    updater.on('update-downloaded',info=>publish({status:'downloaded',version:info.version,notes:notes(info.releaseNotes)||state.notes,percent:100,error:null}));
    updater.on('error',error=>{log?.error('updater error:',error?.stack||error?.message||String(error));fail();});
    return updater;
  }
  async function check(){
    if(!enabled||installing||pending||['available','downloading','downloaded'].includes(state.status))return {...state};
    publish({status:'checking',error:null});
    pending=Promise.resolve().then(()=>init().checkForUpdates()).then(result=>{
      // checkForUpdates resolves before the automatic download completes.
      result?.downloadPromise?.catch(fail);
    }).catch(fail).finally(()=>{pending=null;});
    await pending;return {...state};
  }
  function install(){
    if(!enabled||state.status!=='downloaded'||installing)throw Error('No downloaded update is ready.');
    if(!canInstall()){log?.warn('updater: install refused (recording, exporting or unsaved recording open)');throw Error('Finish recording/exporting and save or close your recording before restarting.');}
    installing=true;
    log?.info(`updater: quitAndInstall ${state.version}`);
    try{updater.quitAndInstall(false,true);}catch(error){installing=false;log?.error('updater: quitAndInstall failed:',error?.stack||error?.message);fail();throw error;}
  }
  return {getState:()=>({...state}),check,install,start:()=>check()};
}
module.exports={createUpdater};
