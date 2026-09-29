const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createProjectStore}=require('../electron/projects.cjs');
test('project reopen and current-project update preserve non-destructive trim and original bytes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-project-test-'));
 try {
  const store=createProjectStore(root),edits={duration:10,trim:{start:2,end:7}},bytes=new Uint8Array([1,2,3]);
  const saved=await store.save({mode:'new',name:'Demo',edits,asset:{events:[],fps:30,deferredEffects:true},original:bytes,preview:bytes,camera:bytes});
  const reopened=await createProjectStore(root).open(saved.id);assert.deepEqual(reopened.edits.trim,edits.trim);assert.deepEqual(reopened.original,bytes);assert.equal(reopened.asset.fps,30);
  assert.deepEqual(reopened.camera,bytes);
  assert.equal(reopened.asset.deferredEffects,true);
  await store.save({id:saved.id,mode:'current',edits:{...edits,camera:{visible:false,mirror:false},trim:{start:3,end:5}},original:bytes,preview:bytes,camera:reopened.camera});
  assert.deepEqual((await store.open(saved.id)).camera,bytes);assert.equal((await store.open(saved.id)).edits.camera.visible,false);
  assert.deepEqual((await store.open(saved.id)).edits.trim,{start:3,end:5});assert.equal((await store.list()).length,1);
  const single=await store.save({mode:'single',edits,original:bytes,preview:bytes});assert.equal((await store.open(single.id)).kind,'single');assert.equal((await store.list()).length,2);
  await assert.rejects(store.open('../outside'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('edits-only autosave, folders and moving recordings',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-project-test-'));
 try {
  const store=createProjectStore(root),edits={duration:10,trim:{start:0,end:10}},bytes=new Uint8Array([1,2,3]);
  const a=await store.save({mode:'single',name:'A',edits,original:bytes,preview:bytes});
  await store.saveEdits(a.id,{...edits,trim:{start:1,end:9},video:{roundness:12}});
  const opened=await store.open(a.id);assert.deepEqual(opened.edits.trim,{start:1,end:9});assert.equal(opened.edits.video.roundness,12);assert.deepEqual(opened.original,bytes);
  await assert.rejects(store.saveEdits(a.id,{duration:10,trim:{start:5,end:2}}),/Invalid saved trim/);
  assert.deepEqual(await store.listFolders(),[]);
  const f=await store.createFolder('  Tutorials ');assert.equal(f.name,'Tutorials');
  await assert.rejects(store.createFolder(' '),/Enter a name/);
  await store.move(a.id,f.id);assert.equal((await store.list())[0].folderId,f.id);
  await store.save({id:a.id,mode:'current',edits,original:bytes,preview:bytes});assert.equal((await store.list())[0].folderId,f.id); // Save keeps the folder
  await assert.rejects(store.move(a.id,'00000000-0000-4000-8000-000000000000'),/no longer exists/);
  assert.equal((await store.renameFolder(f.id,'Guides')).name,'Guides');assert.equal((await store.listFolders())[0].name,'Guides');
  await store.removeFolder(f.id);
  assert.deepEqual(await store.listFolders(),[]);assert.equal((await store.list())[0].folderId,null); // recording kept, back at top level
  assert.equal((await store.list()).length,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('saving keeps one copy; rename, delete and prune of leftover copies',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'showcase-project-test-'));
 const folders=async()=>(await fs.readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()).length;
 try {
  const store=createProjectStore(root),edits={duration:10,trim:{start:0,end:10}},bytes=new Uint8Array([1,2,3]);
  const a=await store.save({mode:'new',name:'A',edits,original:bytes,preview:bytes});
  await store.save({id:a.id,mode:'current',edits,original:bytes,preview:bytes});
  await store.save({id:a.id,mode:'current',edits,original:bytes,preview:bytes});
  assert.equal(await folders(),1); // old revisions removed after each save
  assert.deepEqual((await store.open(a.id)).original,bytes);
  assert.deepEqual(await store.rename(a.id,'  Launch demo  '),{id:a.id,name:'Launch demo'});
  assert.equal((await store.list())[0].name,'Launch demo');
  await assert.rejects(store.rename(a.id,'   '),/Enter a name/);
  const b=await store.save({mode:'new',name:'B',edits,original:bytes,preview:bytes});
  // A leftover copy from an older version of the app, and a fresh folder from a save in progress.
  const stale=path.join(root,'00000000-0000-4000-8000-000000000000'),fresh=path.join(root,'11111111-1111-4111-8111-111111111111');
  await fs.mkdir(stale);await fs.writeFile(path.join(stale,'original.webm'),new Uint8Array(100));
  const old=new Date(Date.now()-2*3600e3);await fs.utimes(stale,old,old);
  await fs.mkdir(fresh);
  assert.equal(await store.prune(),100);
  await assert.rejects(fs.stat(stale));await fs.stat(fresh); // in-progress folder kept
  await store.remove(a.id);
  assert.deepEqual((await store.list()).map(p=>p.id),[b.id]);
  await assert.rejects(store.open(a.id));
  assert.deepEqual((await store.open(b.id)).original,bytes);
  await assert.rejects(store.remove('../outside'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
