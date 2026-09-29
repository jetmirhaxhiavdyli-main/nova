import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareTrimmedExport,trimRange} from '../src/trimExport.mjs';
import {editorZooms,editorCamera,editorCursor} from '../src/editorMotion.mjs';
import {generateZoomTimeline} from '../src/autoZoom.mjs';
import {validateZoomTimeline} from '../src/zoomTimeline.mjs';
test('trim rebases metadata and retains pre-cut spring history without mutating project edits',()=>{
 const events=[{type:'pointer',time:0,x:.2,y:.2},{type:'click',time:500,x:.2,y:.2},{type:'pointer',time:1800,x:.8,y:.7},{type:'click',time:2200,x:.8,y:.7},{type:'click',time:4000,x:.4,y:.4}];
 const edits={duration:6,trim:{start:2,end:4},zooms:editorZooms(generateZoomTimeline(events,6000)),splits:[{t:1},{t:3},{t:4}],cursor:{smoothness:70}};
 const recording={events,clicks:[.5,2.2,4],cursor:[[1,.2,.2],[3,.8,.7]]};
 const before=JSON.stringify({edits,recording});const t=prepareTrimmedExport(recording,edits);
 assert.equal(t.edits.duration,2);assert.equal(t.sourceStart,2);assert.deepEqual(t.edits.splits,[{t:1}]);
 assert(Math.abs(t.recording.clicks[0]-.2)<1e-10);assert.equal(t.recording.clicks.length,1);
 assert.deepEqual(t.recording.cursor,[[1,.8,.7]]);assert.equal(t.recording.events[0].time,0);
 validateZoomTimeline(t.edits.zoomTimeline);
 assert(t.edits.zoomTimeline.segments.every(s=>s.start>=0&&s.end<=2000));
 const original=editorCamera(edits.zooms,6,events),m=t.recording.motionSource,replay=editorCamera(m.edits.zooms,m.edits.duration,m.events);
 assert.deepEqual(original(2000),replay(m.offset*1000));
 assert.deepEqual(editorCursor(events)(2000),editorCursor(m.events)(m.offset*1000));
 assert.equal(JSON.stringify({edits,recording}),before);
});
test('trim supports legacy untrimmed edits and rejects reversed/out-of-range cuts',()=>{
 assert.deepEqual(trimRange({duration:4}),{start:0,end:4,duration:4});
 for(const trim of [{start:2,end:1},{start:-1,end:1},{start:0,end:5},{start:1,end:1}])assert.throws(()=>trimRange({duration:4,trim}));
});
