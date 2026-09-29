import {CAMERA_DEFAULTS} from './components/editor/constants.js';
export function reviewEdits(recording){return {
  duration:recording.duration,output:{size:'original'},background:{mode:'none',padding:0},video:{roundness:0,shadow:0},
  cursor:{hidden:!recording.cursorFree,smoothness:70,style:'default',clickSound:false},
  audio:{music:'none',voice:100},zooms:recording.zooms||[],splits:[],camera:{...CAMERA_DEFAULTS},
};}
