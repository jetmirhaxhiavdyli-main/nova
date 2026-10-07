import React from 'react';
import area from '../assets/icons/area.svg';
import camera from '../assets/icons/camera.svg';
import cameraOff from '../assets/icons/camera-off.svg';
import check from '../assets/icons/check.svg';
import close from '../assets/icons/close.svg';
import display from '../assets/icons/display.svg';
import grip from '../assets/icons/grip.svg';
import list from '../assets/icons/list.svg';
import mic from '../assets/icons/mic.svg';
import micOff from '../assets/icons/mic-off.svg';
import pause from '../assets/icons/pause.svg';
import play from '../assets/icons/play.svg';
import restart from '../assets/icons/restart.svg';
import stop from '../assets/icons/stop.svg';
import trash from '../assets/icons/trash.svg';
import wave from '../assets/icons/wave.svg';
import trashBin from '../assets/icons/trash-bin.svg';
import scissors from '../assets/icons/scissors.svg';
import folder from '../assets/icons/folder.svg';
import arrowDownToLine from '../assets/icons/arrow-down-to-line.svg';
import playOutline from '../assets/icons/play-outline.svg';
import windowIcon from '../assets/icons/window.svg';
// Editor icons. Stand-ins drawn to the HeroUI kit's 16px stroke style; replace with the Figma exports when available.
import chevronLeft from '../assets/icons/chevron-left.svg';
import chevronDown from '../assets/icons/chevron-down.svg';
import undo from '../assets/icons/undo.svg';
import redo from '../assets/icons/redo.svg';
import floppyDisk from '../assets/icons/floppy-disk.svg';
import crop from '../assets/icons/crop.svg';
import video from '../assets/icons/video.svg';
import picture from '../assets/icons/picture.svg';
import volume from '../assets/icons/volume.svg';
import zoomIn from '../assets/icons/zoom-in.svg';
import music from '../assets/icons/music.svg';
import plus from '../assets/icons/plus.svg';
import folderCheck from '../assets/icons/folder-check.svg';
import folderPlus from '../assets/icons/folder-plus.svg';
import cursorSmooth from '../assets/icons/cursor-smooth.svg';
import bell from '../assets/icons/bell.svg';
import screenshot from '../assets/icons/screenshot.svg';
import brandLogo from '../assets/brand/nova-logo.png';
import appIcon from '../assets/brand/nova-icon.png';
import appIconLight from '../assets/brand/nova-icon-light.png';

// Full-colour brand images, drawn as-is (not tinted like the icons below).
const IMAGES = { brand: brandLogo, 'app-icon': appIcon, 'app-icon-light': appIconLight };

const ICONS = { area, bell, screenshot, camera, 'camera-off': cameraOff, check, close, display, grip, list, mic, 'mic-off': micOff, pause, play, restart, stop, trash, wave, window: windowIcon,
  'trash-bin': trashBin, scissors, folder, 'arrow-down-to-line': arrowDownToLine, 'play-outline': playOutline,
  'chevron-left': chevronLeft, 'chevron-down': chevronDown, undo, redo, 'floppy-disk': floppyDisk, crop, video, picture, volume, 'zoom-in': zoomIn,
  music, plus, 'folder-check': folderCheck, 'folder-plus': folderPlus, 'cursor-smooth': cursorSmooth };

/**
 * Renders an icon exported from the Figma file (src/assets/icons) in `currentColor`,
 * so one SVG can follow HeroUI states (muted, selected, danger…) without extra copies.
 */
export default function Icon({ name, size = 16, className = '' }) {
  if (IMAGES[name]) return <img src={IMAGES[name]} alt="" aria-hidden="true" draggable={false} className={`icon-image ${className}`} width={size} height={size} />;
  const src = ICONS[name];
  if (!src) return null;
  return <span aria-hidden="true" className={`icon ${className}`} style={{ '--icon': `url("${src}")`, width: size, height: size }} />;
}
