import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compositionLayout} from '../src/editorExport.mjs';
test('composition respects output size, padding and clamped drag position',()=>{
  const edits={output:{size:'1:1'},background:{mode:'preset',padding:8},video:{position:{x:1,y:-1}}};
  const g=compositionLayout({width:1920,height:1080},edits);
  assert.equal(g.width,1080);assert.equal(g.height,1080);
  assert.ok(Math.abs(g.vw-1080*.84)<1e-8);assert.equal(g.vx+g.vw,1080);assert.equal(g.vy,0);
  edits.background.mode='none';edits.video.position={x:0,y:0};
  const full=compositionLayout({width:1920,height:1080},edits);
  assert.equal(full.vw,1080);assert.equal(full.vx,0);assert.ok(full.vy>0);
});

