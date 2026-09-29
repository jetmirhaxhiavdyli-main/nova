const {test}=require('node:test');
const assert=require('node:assert/strict');
const {displayForSource}=require('../electron/displayMatch.cjs');

const a={id:111},b={id:222};
const s0={id:'screen:0:0',display_id:'111'},s1={id:'screen:1:0',display_id:'222'},win={id:'window:5:0',display_id:''};

test('exact display_id match wins',()=>{
  assert.equal(displayForSource([a,b],s1,[s0,s1,win]),b);
});
test('a mismatched or empty display_id falls back to the only display',()=>{
  // The failing PC: one monitor, display_id not matching Electron's id.
  assert.equal(displayForSource([a],{id:'screen:0:0',display_id:'2528732444'},[{id:'screen:0:0',display_id:'2528732444'},win]),a);
  assert.equal(displayForSource([a],{id:'screen:0:0',display_id:''},[{id:'screen:0:0',display_id:''}]),a);
});
test('several displays with unmatched ids pair up by position only when the counts agree',()=>{
  const x0={id:'screen:0:0',display_id:''},x1={id:'screen:1:0',display_id:''};
  assert.equal(displayForSource([a,b],x1,[x0,x1,win]),b);
  assert.equal(displayForSource([a,b],x1,[x1]),null); // counts differ: refuse to guess
});
test('missing input returns null',()=>{
  assert.equal(displayForSource([],s0,[s0]),null);
  assert.equal(displayForSource([a],null,[]),null);
});
