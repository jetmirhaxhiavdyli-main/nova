const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createSettings,validAccelerator,canonical,DEFAULTS}=require('../electron/settings.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'nova-settings-'));
test('defaults, round trip and no temp files left behind',()=>{
  const dir=tmp(),file=path.join(dir,'settings.json');
  const s=createSettings({file});
  assert.deepEqual(s.get(),DEFAULTS);
  s.set({screenshotShortcut:'Control+Alt+S',startWithWindows:true});
  assert.deepEqual(createSettings({file}).get(),{screenshotShortcut:'Control+Alt+S',startWithWindows:true});
  assert.deepEqual(fs.readdirSync(dir),['settings.json']);
});
test('corrupt or invalid files fall back to defaults',()=>{
  const dir=tmp(),file=path.join(dir,'settings.json');
  fs.writeFileSync(file,'{nope');
  assert.deepEqual(createSettings({file}).get(),DEFAULTS);
  fs.writeFileSync(file,JSON.stringify({screenshotShortcut:'S',startWithWindows:'yes'}));
  assert.deepEqual(createSettings({file}).get(),DEFAULTS);
});
test('shortcuts need a modifier, a known key and must not reuse a reserved one',()=>{
  for(const ok of ['Control+Shift+5','Alt+F12','CommandOrControl+Shift+S','Control+Alt+Space','Control+-'])assert.ok(validAccelerator(ok),ok);
  for(const bad of ['S','Shift','Control+','Control+Shift+Banana','','Ctrl+Shift+5; rm',5,null])assert.ok(!validAccelerator(bad),String(bad));
  assert.equal(canonical('Ctrl+Shift+X'),canonical('Shift+CommandOrControl+x'));
  assert.ok(!validAccelerator('Ctrl+Shift+x',['CommandOrControl+Shift+X']));
  const s=createSettings({file:path.join(tmp(),'s.json'),reserved:['CommandOrControl+Shift+X']});
  assert.throws(()=>s.set({screenshotShortcut:'Control+Shift+X'}));
  assert.throws(()=>s.set({startWithWindows:'yes'}));
  assert.deepEqual(s.get(),DEFAULTS); // a rejected change saves nothing
});
