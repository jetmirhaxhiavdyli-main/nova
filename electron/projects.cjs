const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const validId=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id);
function validateEdits(edits) {
  const {duration,trim}=edits||{};
  if(!Number.isFinite(duration)||duration<=0||!trim||![trim.start,trim.end].every(Number.isFinite)||trim.start<0||trim.end>duration||trim.end<=trim.start)throw Error('Invalid saved trim.');
}
const cleanName=(name,fallback)=>{const n=String(name??'').trim().slice(0,160);if(!n&&fallback===undefined)throw Error('Enter a name.');return n||fallback;};
function createProjectStore(root) {
  const manifest=id=>path.join(root,id+'.json'),foldersFile=path.join(root,'folders.json');
  async function readDoc(id) {
    if(!validId(id))throw Error('Invalid recording ID.');
    const doc=JSON.parse(await fs.readFile(manifest(id),'utf8'));if(doc.id!==id)throw Error('Invalid project.');return doc;
  }
  async function writeDoc(doc) { // atomic manifest swap
    const temporary=path.join(root,doc.id+'.'+randomUUID()+'.tmp');
    await fs.writeFile(temporary,JSON.stringify(doc));await fs.rename(temporary,manifest(doc.id));
  }
  async function readFolders() {
    try {const list=JSON.parse(await fs.readFile(foldersFile,'utf8'));return Array.isArray(list)?list.filter(f=>validId(f?.id)&&typeof f.name==='string'):[];}
    catch(error){if(error.code==='ENOENT')return [];throw error;}
  }
  async function writeFolders(list) {
    await fs.mkdir(root,{recursive:true});const temporary=foldersFile+'.'+randomUUID()+'.tmp';
    await fs.writeFile(temporary,JSON.stringify(list));await fs.rename(temporary,foldersFile);
  }
  return {
    async save({id,mode,name,edits,asset,original,preview,camera,folderId}) {
      if(!['current','new','single'].includes(mode))throw Error('Invalid save mode.');
      validateEdits(edits);
      if(!(original instanceof Uint8Array)||!original.length||!(preview instanceof Uint8Array)||!preview.length)throw Error('Recording data is missing.');
      if(camera!==undefined&&(!(camera instanceof Uint8Array)||!camera.length))throw Error('Invalid camera recording.');
      if(mode==='current'&&!validId(id))throw Error('Open or create a project first.');
      const key=mode==='current'?id:randomUUID(),revision=randomUUID();
      await fs.mkdir(root,{recursive:true});
      const previous=mode==='current'?JSON.parse(await fs.readFile(path.join(root,key+'.json'),'utf8')):null;
      const folder=path.join(root,revision);await fs.mkdir(folder);
      const doc={version:1,id:key,revision,name:String(name||previous?.name||'Recording').slice(0,160),kind:mode==='single'?'single':previous?.kind||'project',updatedAt:new Date().toISOString(),edits,asset,hasCamera:!!camera,
        folderId:mode==='current'?previous?.folderId??null:validId(folderId)?folderId:null};
      const temporary=path.join(root,key+'.'+revision+'.tmp');
      try {
        await fs.writeFile(path.join(folder,'original.webm'),original);await fs.writeFile(path.join(folder,'preview.webm'),preview);
        if(camera)await fs.writeFile(path.join(folder,'camera.webm'),camera);
        await fs.writeFile(temporary,JSON.stringify(doc));await fs.rename(temporary,path.join(root,key+'.json'));
      } catch(error) {await fs.rm(temporary,{force:true});await fs.rm(folder,{recursive:true,force:true});throw error;}
      // Only the latest revision is kept: the manifest now points at the new folder, so the old copy can go.
      if(validId(previous?.revision)&&previous.revision!==revision)await fs.rm(path.join(root,previous.revision),{recursive:true,force:true}).catch(()=>{});
      return {id:key,projectName:doc.kind==='project'?doc.name:null};
    },
    /** Autosave: edits only (the video files stay as they are). */
    async saveEdits(id,edits) {
      validateEdits(edits);
      const doc=await readDoc(id);await writeDoc({...doc,edits,updatedAt:new Date().toISOString()});
      return {id};
    },
    async rename(id,name) {
      const clean=cleanName(name),doc=await readDoc(id);
      await writeDoc({...doc,name:clean});
      return {id,name:clean};
    },
    async remove(id) {
      const doc=await readDoc(id);
      await fs.rm(manifest(id),{force:true}); // manifest first: a half-deleted project never shows up broken
      if(validId(doc.revision))await fs.rm(path.join(root,doc.revision),{recursive:true,force:true});
    },
    async move(id,folderId) {
      if(folderId!==null&&!(await readFolders()).some(f=>f.id===folderId))throw Error('That folder no longer exists.');
      const doc=await readDoc(id);await writeDoc({...doc,folderId});
      return {id,folderId};
    },
    listFolders:readFolders,
    async createFolder(name) {
      const folder={id:randomUUID(),name:cleanName(name),createdAt:new Date().toISOString()};
      await writeFolders([...await readFolders(),folder]);return folder;
    },
    async renameFolder(id,name) {
      const clean=cleanName(name),list=await readFolders();
      if(!list.some(f=>f.id===id))throw Error('That folder no longer exists.');
      await writeFolders(list.map(f=>f.id===id?{...f,name:clean}:f));return {id,name:clean};
    },
    /** Deletes the folder only: its recordings move back to the top level. */
    async removeFolder(id) {
      const list=await readFolders();if(!list.some(f=>f.id===id))return;
      await writeFolders(list.filter(f=>f.id!==id));
      for(const file of await fs.readdir(root))if(file.endsWith('.json')&&validId(file.slice(0,-5))) {
        try {const doc=await readDoc(file.slice(0,-5));if(doc.folderId===id)await writeDoc({...doc,folderId:null});} catch {/* unreadable save stays as is */}
      }
    },
    /**
     * Frees space from revision folders no manifest points to (copies left by saves before cleanup existed,
     * or interrupted saves). Folders newer than `minAgeMs` are skipped, since a save in progress writes its
     * folder before its manifest. Returns the bytes freed.
     */
    async prune(minAgeMs=60*60*1000) {
      await fs.mkdir(root,{recursive:true});
      const entries=await fs.readdir(root,{withFileTypes:true}),used=new Set();
      for(const e of entries)if(e.isFile()&&e.name.endsWith('.json')&&validId(e.name.slice(0,-5))) {
        try {used.add(JSON.parse(await fs.readFile(path.join(root,e.name),'utf8')).revision);} catch {return 0;} // unreadable manifest: don't guess, keep everything
      }
      let freed=0;
      for(const e of entries)if(e.isDirectory()&&validId(e.name)&&!used.has(e.name)) {
        const folder=path.join(root,e.name);
        try {
          if(Date.now()-(await fs.stat(folder)).mtimeMs<minAgeMs)continue;
          for(const f of await fs.readdir(folder))freed+=(await fs.stat(path.join(folder,f))).size;
          await fs.rm(folder,{recursive:true,force:true});
        } catch {/* in use or already gone */}
      }
      return freed;
    },
    async list() {
      await fs.mkdir(root,{recursive:true});const docs=[];
      for(const file of await fs.readdir(root))if(file.endsWith('.json')&&validId(file.slice(0,-5))) {
        try {const d=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));validateEdits(d.edits);docs.push({id:d.id,name:d.name,date:(d.kind==='project'?'Project':'Recording')+' · '+new Date(d.updatedAt).toLocaleDateString(),duration:Math.round(d.edits.trim.end-d.edits.trim.start)+'s',updatedAt:d.updatedAt,folderId:validId(d.folderId)?d.folderId:null});}catch{/* Other valid saves remain available. */}
      }
      return docs.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    },
    async open(id) {
      if(!validId(id))throw Error('Invalid recording ID.');
      const doc=JSON.parse(await fs.readFile(path.join(root,id+'.json'),'utf8'));validateEdits(doc.edits);
      if(doc.version!==1||doc.id!==id||!validId(doc.revision))throw Error('Invalid project.');
      const folder=path.join(root,doc.revision);
      return {...doc,camera:doc.hasCamera?new Uint8Array(await fs.readFile(path.join(folder,'camera.webm'))):undefined,original:new Uint8Array(await fs.readFile(path.join(folder,'original.webm'))),preview:new Uint8Array(await fs.readFile(path.join(folder,'preview.webm')))};
    },
  };
}
module.exports={createProjectStore};
