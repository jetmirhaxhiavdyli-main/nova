import React,{useEffect,useState} from 'react';
import {Button,Modal} from '@heroui/react';
import Icon from './components/Icon';
import {Segmented} from './components/editor/panels/PanelShell';
import {THEMES,useTheme} from './theme';
import {resetTips} from './components/Tips';

/** Appearance row in About: System / Light / Dark, plus "Show tips again" for the first-run tips. */
function ThemeSwitch(){
  const [theme,setTheme]=useTheme();
  const [reset,setReset]=useState(false);
  return <>
    <div className="about__theme"><span className="about__theme-label">Appearance</span><Segmented label="Appearance" value={theme} options={THEMES} onChange={setTheme}/></div>
    <div className="about__theme"><span className="about__theme-label">Tips</span><Button size="sm" variant="secondary" isDisabled={reset} onPress={()=>{resetTips();setReset(true);}}>{reset?'Tips will show again':'Show tips again'}</Button></div>
  </>;
}

/** Statuses that mean a newer version exists (shown as the toolbar bell's dot). */
export const UPDATE_PENDING=['available','downloading','downloaded'];
// Browser preview (`?preview=update`): a downloaded update, so the bell shows its dot.
const PREVIEW_UPDATE=new URLSearchParams(location.search).get('preview')==='update'?{status:'downloaded',enabled:true,currentVersion:'0.1.0',version:'0.2.0',notes:'Faster exports and a lighter toolbar.'}:null;

/** Live updater state from the main process (electron/updater.cjs). */
export function useUpdateState(){
  const bridge=window.recorder;
  const [state,setState]=useState(PREVIEW_UPDATE||{status:'disabled',enabled:false,currentVersion:'…'});
  useEffect(()=>{
    if(!bridge?.updateState)return;
    let active=true,received=false;
    const off=bridge.onUpdateState(s=>{received=true;if(active)setState(s);});
    bridge.updateState().then(s=>{if(active&&!received)setState(s);}).catch(()=>{});
    return()=>{active=false;off();};
  },[bridge]);
  return [state,setState];
}

const labels={idle:'Ready to check for updates.',disabled:'Updates are available in installed Windows builds.',checking:'Checking for updates…',available:'Update available. Starting download…','up-to-date':'You’re up to date.',downloading:'Downloading update…',downloaded:'Update ready to install.',error:'Update failed.'};
export default function UpdateAbout({busy,unsaved}){
  const bridge=window.recorder;
  const [open,setOpen]=useState(false),[state,setState]=useUpdateState(),[later,setLater]=useState(null),[error,setError]=useState('');
  useEffect(()=>{bridge?.updateActivity?.({busy,unsaved});},[bridge,busy,unsaved]);
  useEffect(()=>{const show=()=>setOpen(true);window.addEventListener('show-about',show);return()=>window.removeEventListener('show-about',show);},[]);
  const check=async()=>{setError('');try{setState(await bridge.checkForUpdates());}catch{setError('Could not check for updates. Please try again.');}};
  // `installing` stays on until the app quits (quitAndInstall); it only clears if the main process refuses.
  const [installing,setInstalling]=useState(false);
  const install=async()=>{setError('');setInstalling(true);if(!bridge?.installUpdate)return;/* browser preview: just show the preloader */try{await bridge.installUpdate();}catch(e){setInstalling(false);setError(e.message);}};
  const ready=state.status==='downloaded',pending=['checking','available','downloading'].includes(state.status);
  return <>
    {/* A ready update is announced by the toolbar bell's dot (RecordToolbar → UpdateBell), not a toast. */}
    <Modal.Backdrop isOpen={open} onOpenChange={o=>{if(!installing)setOpen(o);}} isDismissable={!installing} isKeyboardDismissDisabled={installing}>
      <Modal.Container placement="center"><Modal.Dialog className="finished update-dialog" aria-label="About Nova" aria-busy={installing||undefined}>
        {installing&&<div className="update-installing" role="status" aria-live="polite">
          <span className="update-installing__spinner" aria-hidden="true"/>
          <strong>Installing Nova {state.version}…</strong>
          <span>Nova will close and reopen by itself. This can take up to a minute.</span>
        </div>}
        <Modal.CloseTrigger aria-label="Close About" isDisabled={installing}/>
        <Modal.Header><Icon name="app-icon" size={56} className="brand-mark--about app-icon--dark" /><Icon name="app-icon-light" size={56} className="brand-mark--about app-icon--light" /><Modal.Heading>About Nova</Modal.Heading><p>Version {state.currentVersion}</p></Modal.Header>
        <Modal.Body>
          <p className="about__blurb">This is a passion project of mine that I decided to see what people make of it.</p>
          <p className="about__blurb about__credit">Created by: Jetmir Haxhiavdyli - justmila.design</p>
          <ThemeSwitch/>
          {ready&&<h3>Nova {state.version} is ready</h3>}
          <p role="status">{labels[state.status]} {state.status==='downloading'?`${Math.round(state.percent)}%`:''}</p>
          {state.status==='downloading'&&<progress aria-label="Update download progress" value={state.percent} max={100}/>}
          {state.notes&&<details open={ready}><summary>Release notes</summary><pre style={{whiteSpace:'pre-wrap',font:'inherit',maxHeight:240,overflow:'auto'}}>{state.notes}</pre></details>}
          {ready&&!state.notes&&<p>No release notes were provided for this update.</p>}
          {(state.error||error)&&<p role="alert">{error||state.error}</p>}
          {ready&&(busy||unsaved)&&<p>Finish your work and save or close your recording before restarting.</p>}
        </Modal.Body>
        <Modal.Footer>
          {/* Opens userData/logs (updater + recording start-up diagnostics) so testers can send nova.log. */}
          {bridge?.openLogs&&<Button variant="ghost" className="about__logs" onPress={()=>bridge.openLogs().catch(()=>{})}>Show logs</Button>}
          {ready?<><Button variant="secondary" onPress={()=>{setLater(state.version);setOpen(false);}}>Later</Button><Button isDisabled={busy||unsaved||installing} onPress={install}>{installing?'Restarting…':<>Restart &amp; update</>}</Button></>:<Button isDisabled={!state.enabled||pending} onPress={check}>Check for updates</Button>}
        </Modal.Footer>
      </Modal.Dialog></Modal.Container>
    </Modal.Backdrop>
  </>;
}
