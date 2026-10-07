const { ClipboardItem } = require('electron');
const { app, BrowserWindow, desktopCapturer, session, ipcMain, dialog, globalShortcut, screen, Menu, systemPreferences, shell, Tray, nativeImage, clipboard, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { validate: validateExport, encode } = require('./export.cjs');
let exportJob = null;
let editorExport = null;
const {createEditorExport} = require('./editorExport.cjs');
let window, selected, recording = false;
// Nova stays in the tray when its window is closed; `quitting` lets a real quit (tray Quit, update install, logoff) through.
let quitting = false, tray = null, shotShortcut = null;
const startHidden = process.argv.includes('--hidden');
const STOP_SHORTCUT = 'CommandOrControl+Shift+X';
let overlayInteractive = false;
let editorMode = false, editorBounds = null;
let updateActivity={busy:false,unsaved:false};
// Keep the pre-rebrand data folder (projects, logs) so renaming the app to Nova never strands them.
// Only replaces Electron's default: a folder set by --user-data-dir or a test script is kept.
if (app.getPath('userData') === path.join(app.getPath('appData'), app.getName())) app.setPath('userData', path.join(app.getPath('appData'), 'showcase-recorder'));
const diagnostics=require('./diagnostics.cjs').createDiagnostics(app);
const recordingMetrics=require('./recordingMetrics.cjs').createRecordingMetrics(app,value=>diagnostics.log.info(value));
const updates=require('./updater.cjs').createUpdater({app,log:diagnostics.log,
  notify:state=>{if(window&&!window.isDestroyed())window.webContents.send('update-state',state);},
  canInstall:()=>!recording&&!exportJob&&!updateActivity.busy&&!updateActivity.unsaved,
});
const nativeCapture = require('./nativeCaptureHost.cjs').createNativeCapture({ desktopCapturer, screen,
  utilityProcess:require('electron').utilityProcess,MessageChannelMain:require('electron').MessageChannelMain,
  deliverPort:(message,port)=>window.webContents.postMessage('native-capture-port',message,[port]),
  log:message=>diagnostics.log.info(message),
});
const clicks = require('./clickTracking.cjs').createClickTracking({ screen, systemPreferences, desktopCapturer,
  canSend: () => recording && !overlayInteractive && window && !window.isDestroyed(),
  send: point => window.webContents.send('recording-click', point),
  sendMove: point => window.webContents.send('recording-pointer', point),
  sendActivity: activity => window.webContents.send('recording-activity', activity),
});
const index = path.join(__dirname, '../dist/index.html');
// Taskbar/window icon when run unpackaged (npm start); packaged builds use the exe's icon (build/icon.png via electron-builder).
const devIcon = app.isPackaged ? undefined : path.join(__dirname, '../build/icon.png');
function assertSender(event) { if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted request'); }
function showWindow() { if (!window || window.isDestroyed()) return; if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
if(app.isPackaged&&!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(() => {
  app.setAppUserModelId('studio.showcase.recorder'); // needed for Windows toast notifications
  app.on('second-instance',showWindow);
  const { createSettings, validAccelerator } = require('./settings.cjs');
  const settings = createSettings({ file: path.join(app.getPath('userData'), 'settings.json'), reserved: [STOP_SHORTCUT] });
  // Screenshot: the dim appears at once, the display under the cursor is frozen, the user drags an area; it is copied and previewed (Copy / Save).
  const shotWin = require('./screenshotWindow.cjs').createShotWindow({ BrowserWindow, preload: path.join(__dirname, 'preload.cjs'), icon: devIcon, load: win => win.loadFile(index, { query: { screenshot: '1' } }) });
  // Electron 44's clipboard takes ClipboardItems (the old writeImage is gone): write the cropped image as PNG.
  const imageClipboard = { writeImage: image => clipboard.write([new ClipboardItem({ 'image/png': new Blob([image.toPNG()], { type: 'image/png' }) })]) };
  async function saveScreenshot(png) {
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.');
    const { canceled, filePath } = await dialog.showSaveDialog(shotWin.window, { title: 'Save screenshot', defaultPath: path.join(app.getPath('pictures'), `Nova Screenshot ${stamp}.png`), filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, png);
    return filePath;
  }
  const screenshot = require('./screenshot.cjs').createScreenshot({ desktopCapturer, screen, clipboard: imageClipboard, win: shotWin, save: saveScreenshot,
    canStart: () => !recording && !exportJob,
    // Nova's own always-on-top overlay is hidden from the grab (not in editor mode, where the editor is a normal window).
    prepare: async () => { if (window && !window.isDestroyed() && !editorMode) { window.setContentProtection(true); await new Promise(resolve => setTimeout(resolve, 60)); } },
    release: () => { if (window && !window.isDestroyed()) window.setContentProtection(recording); },
    log: message => diagnostics.log.info(message),
  });
  const takeScreenshot = () => { screenshot.start().catch(error => diagnostics.log.error('screenshot:', error?.message || error)); };
  ipcMain.on('screenshot-take', event => { assertSender(event); takeScreenshot(); });
  const assertShot = event => { if (!screenshot.owns(event.sender)) throw new Error('Untrusted request'); };
  ipcMain.on('screenshot-mounted', event => { if (screenshot.owns(event.sender)) shotWin.mounted(); });
  ipcMain.handle('screenshot-done', (event, rect, viewport) => { assertShot(event); return screenshot.finish(rect, viewport); });
  ipcMain.handle('screenshot-crop', (event, rect) => { assertShot(event); return screenshot.crop(rect ?? null); });
  ipcMain.handle('screenshot-copy', event => { assertShot(event); return screenshot.copy(); });
  ipcMain.handle('screenshot-save', event => { assertShot(event); return screenshot.save(); });
  ipcMain.on('screenshot-cancel', event => { if (screenshot.owns(event.sender)) screenshot.cancel(); });
  function registerShot(accelerator) {
    if (shotShortcut === accelerator) return true;
    let ok = false;
    try { ok = globalShortcut.register(accelerator, takeScreenshot); } catch { ok = false; }
    if (!ok) return false;
    if (shotShortcut) globalShortcut.unregister(shotShortcut);
    shotShortcut = accelerator;
    return true;
  }
  const applyAutoStart = value => { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: value, args: ['--hidden'] }); };
  const publicSettings = () => ({ ...settings.get(), autoStartAvailable: app.isPackaged, shortcutActive: shotShortcut === settings.get().screenshotShortcut });
  ipcMain.handle('settings-get', event => { assertSender(event); return publicSettings(); });
  ipcMain.handle('settings-set', (event, patch) => {
    assertSender(event);
    const before = settings.get();
    if (patch?.screenshotShortcut !== undefined && patch.screenshotShortcut !== before.screenshotShortcut) {
      if (!validAccelerator(patch.screenshotShortcut, [STOP_SHORTCUT])) return { settings: publicSettings(), error: 'That shortcut is not valid. Use at least one modifier (Ctrl, Alt or Shift) and one key.' };
      if (!registerShot(patch.screenshotShortcut)) return { settings: publicSettings(), error: 'Another app is already using that shortcut. Try a different one.' };
    }
    const saved = settings.set(patch);
    if (patch.startWithWindows !== undefined) applyAutoStart(saved.startWithWindows);
    refreshTray();
    return { settings: publicSettings(), error: null };
  });
  // Tray: Nova keeps running after its window is closed so the screenshot shortcut stays available.
  function quitApp() {
    if (recording || exportJob) { showWindow(); dialog.showMessageBoxSync(window, { type: 'info', message: 'Nova is busy.', detail: 'Stop the recording or wait for the export to finish before quitting.' }); return; }
    app.quit();
  }
  function refreshTray() {
    if (!tray) return;
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Nova', click: showWindow },
      { label: `Take screenshot (${settings.get().screenshotShortcut.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl')})`, click: takeScreenshot },
      { type: 'separator' },
      { label: 'Quit Nova', click: quitApp },
    ]));
  }
  ipcMain.handle('update-state',event=>{assertSender(event);return updates.getState();});
  ipcMain.handle('update-check',event=>{assertSender(event);return updates.check();});
  ipcMain.handle('update-install',event=>{assertSender(event);return updates.install();});
  // Diagnostics: the renderer logs recording start-up stages/failures; About can open the log folder.
  ipcMain.on('diagnostics-log',(event,level,text)=>{assertSender(event);if(typeof text!=='string')return;diagnostics.log[level==='error'?'error':level==='warn'?'warn':'info']('renderer:',text.slice(0,1500));});
  ipcMain.handle('open-logs',event=>{assertSender(event);require('node:fs').mkdirSync(diagnostics.dir,{recursive:true});return shell.openPath(diagnostics.dir);});
  ipcMain.on('update-activity',(event,value)=>{assertSender(event);if(value&&typeof value.busy==='boolean'&&typeof value.unsaved==='boolean')updateActivity={busy:value.busy,unsaved:value.unsaved};});
  const projects=require('./projects.cjs').createProjectStore(path.join(app.getPath('userData'),'projects'));
  ipcMain.handle('project-save',(event,data)=>{assertSender(event);return projects.save(data);});
  ipcMain.handle('project-list',event=>{assertSender(event);return projects.list();});
  ipcMain.handle('project-open',(event,id)=>{assertSender(event);return projects.open(id);});
  ipcMain.handle('project-rename',(event,id,name)=>{assertSender(event);return projects.rename(id,name);});
  ipcMain.handle('project-delete',(event,id)=>{assertSender(event);return projects.remove(id);});
  ipcMain.handle('project-save-edits',(event,id,edits)=>{assertSender(event);return projects.saveEdits(id,edits);});
  ipcMain.handle('project-move',(event,id,folderId)=>{assertSender(event);return projects.move(id,folderId??null);});
  ipcMain.handle('folder-list',event=>{assertSender(event);return projects.listFolders();});
  ipcMain.handle('folder-create',(event,name)=>{assertSender(event);return projects.createFolder(name);});
  ipcMain.handle('folder-rename',(event,id,name)=>{assertSender(event);return projects.renameFolder(id,name);});
  ipcMain.handle('folder-delete',(event,id)=>{assertSender(event);return projects.removeFolder(id);});
  // Old copies from before revision cleanup existed: freed quietly in the background at startup.
  projects.prune().catch(()=>{});
  // Electron 44 reports display capture as media with an empty mediaTypes list.
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const trusted=contents===window?.webContents && (details.isMainFrame!==false);
    const devices=permission==='media' && details.mediaTypes?.length>0 && details.mediaTypes.every(t=>['audio','video'].includes(t));
    callback(trusted && (devices || (!!selected && (permission==='display-capture'||(permission==='media'&&details.mediaTypes?.length===0)))));
  });
  ipcMain.handle('open-privacy-settings',(event,kind)=>{
    assertSender(event);if(!['camera','microphone'].includes(kind))throw Error('Invalid privacy setting');
    const url=process.platform==='win32'?(kind==='camera'?'ms-settings:privacy-webcam':'ms-settings:privacy-microphone'):
      'x-apple.systempreferences:com.apple.preference.security?Privacy_'+(kind==='camera'?'Camera':'Microphone');
    return shell.openExternal(url);
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (request.frame !== window.webContents.mainFrame || !selected) return callback({});
      const id = selected; selected = undefined;
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      const source = sources.find(s => s.id === id);
      callback(source ? { video: source } : {});
    } catch { callback({}); }
  });
  ipcMain.handle('sources', async event => {
    assertSender(event);
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 480, height: 270 } });
    return sources.filter(s => s.name !== 'Nova').map(s => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), type: s.id.startsWith('screen:') ? 'Screen' : 'Window' }));
  });
  ipcMain.handle('select', (event, id) => { assertSender(event); if (typeof id !== 'string') throw new Error('Invalid source'); selected = id; });
  ipcMain.handle('area-source', async event => {
    assertSender(event);
    const display = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
    const source = sources.find(item => item.display_id === String(display.id)) || (sources.length === 1 ? sources[0] : null);
    if (!source) throw new Error('The display containing the selection is unavailable. Try again.');
    return { sourceId: source.id, displayBounds: display.bounds, overlayBounds: window.getContentBounds() };
  });
  ipcMain.handle('active', (event, value) => {
    assertSender(event); recording = value === true;
    if(recording)recordingMetrics.start();else recordingMetrics.stop();
    if (!recording) clicks.stop();
    window.setContentProtection(recording);
    if (window.isMinimized()) window.restore();
    window.showInactive();
  });
  ipcMain.on('interactive', (event, interactive) => {
    assertSender(event);
    if (typeof interactive !== 'boolean') return;
    overlayInteractive = interactive;
    window.setIgnoreMouseEvents(!editorMode && !interactive, { forward: true });
  });
  ipcMain.handle('window-editor', (event, enabled) => {
    assertSender(event);
    if (typeof enabled !== 'boolean' || enabled === editorMode || recording) return;
    if (editorMode) editorBounds = window.getBounds();
    editorMode = enabled;
    const area = screen.getPrimaryDisplay().workArea;
    // 90% of the screen, capped at 1600×1000 so ultrawide/large monitors don't open a huge editor.
    const width = Math.min(area.width, Math.max(1200, Math.min(1600, Math.round(area.width * .9))));
    const height = Math.min(area.height, Math.max(940, Math.min(1000, Math.round(area.height * .9))));
    window.setBounds(enabled ? editorBounds || {x:area.x+Math.round((area.width-width)/2),y:area.y+Math.round((area.height-height)/2),width,height} : area);
    window.setAlwaysOnTop(!enabled);
    window.setIgnoreMouseEvents(enabled ? false : !overlayInteractive, {forward:true});
  });
  ipcMain.handle('window-minimize', event => { assertSender(event); window.minimize(); });
  ipcMain.handle('window-close', event => { assertSender(event); window.close(); });
  ipcMain.handle('track-clicks', async (event, sourceId) => {
    assertSender(event);
    if (typeof sourceId !== 'string') throw new Error('Invalid source');
    await clicks.start(sourceId);
  });
  ipcMain.handle('native-capture-start', (event, sourceId, fps, token, selection) => { assertSender(event); if (typeof sourceId !== 'string'||typeof token!=='string') throw new Error('Invalid source'); return nativeCapture.start(sourceId, fps === 60 ? 60 : 30,token,selection); });
  ipcMain.handle('native-capture-stop', (event,id) => { assertSender(event); return nativeCapture.stop(id); });
  ipcMain.handle('save', async (event, bytes) => {
    assertSender(event);
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('Empty recording');
    const { canceled, filePath } = await dialog.showSaveDialog(window, { title: 'Save recording', defaultPath: path.join(app.getPath('videos'), `Nova-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`), filters: [{ name: 'WebM video', extensions: ['webm'] }] });
    if (canceled) return null;
    await fs.writeFile(filePath, bytes);
    return filePath;
  });
  // Only folders the user picked in the dialog are accepted from the renderer; anything else falls back to the Desktop.
  const exportFolders = new Set();
  ipcMain.handle('export-choose-folder', async (event, current) => {
    assertSender(event);
    const { canceled, filePaths } = await dialog.showOpenDialog(window, { title: 'Choose where to save exports', defaultPath: exportFolders.has(current) ? current : app.getPath('desktop'), properties: ['openDirectory', 'createDirectory'] });
    if (canceled || !filePaths[0]) return null;
    exportFolders.add(filePaths[0]);
    return { path: filePaths[0], name: path.basename(filePaths[0]) || filePaths[0] };
  });
  function exportFolder(options) {
    return exportFolders.has(options?.folder) ? options.folder : app.getPath('desktop');
  }
  // Final export path: the user's name (sanitized for Windows) or "Nova <timestamp>"; never overwrites, adds " (2)", " (3)"…
  async function exportPath(options) {
    const ext = options.format.toLowerCase(), folder = exportFolder(options);
    let base = String(options.fileName || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(new RegExp(`\\.${ext}$`, 'i'), '').replace(/[. ]+$/, '').trim().slice(0, 120);
    if (!base || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `Nova ${new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.')}`;
    for (let i = 1; ; i++) {
      const candidate = path.join(folder, `${base}${i > 1 ? ` (${i})` : ''}.${ext}`);
      try { await fs.access(candidate); } catch { return candidate; }
    }
  }
  ipcMain.handle('export-cancel', event => { assertSender(event); exportJob?.abort(); });
  ipcMain.handle('editor-export-start', async (event, options) => {
    assertSender(event);
    if(exportJob) throw Error('An export is already running.');
    exportJob=new AbortController();
    try { editorExport=await createEditorExport(options,{temp:app.getPath('temp'),target:await exportPath(options),signal:exportJob.signal,onProgress:percent=>{if(!window.isDestroyed()) window.webContents.send('export-progress',percent);}}); }
    catch(error) {exportJob=null;throw error;}
  });
  ipcMain.handle('editor-export-frame', async (event, bytes) => {assertSender(event);if(!editorExport) throw Error('No editor export is running.');await editorExport.frame(bytes);});
  ipcMain.handle('editor-export-finish', async event => {assertSender(event);if(!editorExport) throw Error('No editor export is running.');return await editorExport.finish();});
  ipcMain.handle('editor-export-dispose', async event => {assertSender(event);try {await editorExport?.dispose();} finally {editorExport=null;exportJob=null;}});
  ipcMain.handle('export', async (event, bytes, options) => {
    assertSender(event); validateExport(options);
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('Empty recording.');
    if (exportJob) throw new Error('An export is already running.');
    const job = new AbortController(); exportJob = job;
    let folder, staged;
    try {
      const ext = options.format.toLowerCase();
      const filePath = await exportPath(options);
      if (job.signal.aborted) return { canceled: true };
      folder = await fs.mkdtemp(path.join(app.getPath('temp'), 'showcase-export-'));
      const input = path.join(folder,'recording.webm'), output = path.join(folder,`export.${ext}`);
      await fs.writeFile(input, bytes);
      await encode(input, output, options, { signal: job.signal, durationHint: Number(options.duration) || 0, onProgress: percent => { if (!window.isDestroyed()) window.webContents.send('export-progress', percent); } });
      if (job.signal.aborted) return { canceled: true };
      // Publish to Desktop only after encoding and copying finish successfully.
      staged = path.join(path.dirname(filePath), `.showcase-${randomUUID()}.${ext}`);
      await fs.copyFile(output, staged);
      if (job.signal.aborted) return { canceled: true };
      await fs.rename(staged, filePath); staged = null;
      return { filePath };
    } catch (error) {
      if (job.signal.aborted) return { canceled: true };
      throw error;
    } finally {
      if (staged) await fs.rm(staged, { force: true }).catch(() => {});
      if (folder) await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
      exportJob = null;
    }
  });
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({ ...screen.getPrimaryDisplay().workArea, show: !startHidden, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true, title: 'Nova', icon: devIcon, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  window.setMenu(null);
  // The app is shareable while idle; the recording lifecycle protects its overlay.
  window.setContentProtection(false);
  window.setIgnoreMouseEvents(true, { forward: true });
  const fitWorkArea = () => {
    if (window.isDestroyed()) return;
    if (!editorMode) { window.setBounds(screen.getPrimaryDisplay().workArea); editorBounds = null; return; }
    const area = screen.getDisplayMatching(window.getBounds()).workArea, bounds = window.getBounds();
    const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
    window.setBounds({width,height,x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-width)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))});
  };
  screen.on('display-metrics-changed', fitWorkArea);
  screen.on('display-added', fitWorkArea);
  screen.on('display-removed', fitWorkArea);
  window.on('closed', () => {
    recordingMetrics.stop();
    nativeCapture.stop().catch(() => {});
    clicks.stop();
    screen.removeListener('display-metrics-changed', fitWorkArea);
    screen.removeListener('display-added', fitWorkArea);
    screen.removeListener('display-removed', fitWorkArea);
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('render-process-gone', () => { recordingMetrics.stop();exportJob?.abort(); editorExport?.dispose().catch(()=>{}); editorExport=null; exportJob=null; clicks.stop(); nativeCapture.stop().catch(() => {}); recording = false; if (!window.isDestroyed()) window.setContentProtection(false); });
  window.webContents.on('will-prevent-unload', event => {
    if (recording) return;
    const choice = dialog.showMessageBoxSync(window, { type: 'question', buttons: ['Keep recording', 'Discard and close'], defaultId: 0, cancelId: 0, message: 'You have an unsaved recording.', detail: 'Save your video before closing to keep it.' });
    if (choice === 1) event.preventDefault();
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  // Closing the window hides Nova to the tray (so the screenshot shortcut keeps working); a real quit passes through.
  window.on('close', event => {
    if (exportJob) { event.preventDefault(); return; }
    if (recording) { event.preventDefault(); window.webContents.send('stop'); return; }
    if (!quitting && tray) { event.preventDefault(); window.hide(); }
  });
  window.on('session-end', () => { quitting = true; });
  window.loadFile(index);
  window.webContents.once('did-finish-load',()=>{void updates.start();setTimeout(()=>shotWin.warm(),1500);});
  globalShortcut.register(STOP_SHORTCUT, () => { if (recording) window.webContents.send('stop'); });
  if (!registerShot(settings.get().screenshotShortcut)) diagnostics.log.warn(`screenshot shortcut ${settings.get().screenshotShortcut} is in use by another app`);
  applyAutoStart(settings.get().startWithWindows);
  try { tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../build/icon.png')).resize({ width: 32, height: 32 })); tray.setToolTip('Nova'); tray.on('click', showWindow); refreshTray(); }
  catch (error) { diagnostics.log.warn('tray unavailable:', error?.message || error); }
});
// The tray keeps Nova alive after its window closes; quitting is explicit.
app.on('window-all-closed', () => { if (!tray) app.quit(); });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { recordingMetrics.stop();nativeCapture.stop();clicks.stop();globalShortcut.unregisterAll(); });
