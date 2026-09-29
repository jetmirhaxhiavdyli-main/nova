import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCursorMotion } from '../src/cursorMotion.mjs';
test('cursor smooths sudden moves without jumping or overshooting',()=>{
  const cursor=createCursorMotion();cursor.move({x:0,y:0},0);
  cursor.move({x:1,y:1},0);
  assert.deepEqual(cursor.frame(0),{x:0,y:0});
  const halfway=cursor.frame(50);assert(halfway.x>0&&halfway.x<.8);
  const settled=cursor.frame(1000);assert(Math.abs(settled.x-1)<.001);
  cursor.move({visible:false},1001);assert.equal(cursor.frame(1050),null);
  cursor.move({x:.2,y:.3},1100);assert.deepEqual(cursor.frame(1100),{x:.2,y:.3});
});
test('default cursor takes a gentler path but reaches its target without overshoot',()=>{
  const cursor=createCursorMotion();cursor.move({x:0,y:0},0);cursor.move({x:1,y:1},0);
  const p=cursor.frame(100);assert(p.x>.5 && p.x<.8);
  assert(cursor.frame(500).x>.95);
});
