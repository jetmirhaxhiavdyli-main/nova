import React from 'react';
import Icon from '../Icon';
import { animatedBackground, backgroundKind } from './constants';

export function videoSummary({ roundness, shadow }, background) {
  const scale = background && background.mode !== 'none' ? Math.round(100 - 2 * (background.padding || 0)) : 100;
  const parts = [scale < 100 && `Scale ${scale}%`, roundness && `Rounded ${roundness}`, shadow && `Shadow ${shadow}%`].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Edited as recorded';
}
export function backgroundSummary(background) {
  const { mode, preset } = background;
  if (mode === 'none') return 'None';
  const type = backgroundKind(background);
  const kind = mode === 'color' ? 'Color' : type === 'image' ? 'Image' : type === 'animated' ? animatedBackground(preset)?.label || 'Animated' : background.style === 'smooth' ? 'Smooth gradient' : 'Gradient';
  const blur = mode === 'preset' && type === 'image' && background.image?.blur ? ` · Blur ${background.image.blur}%` : '';
  return `${kind}${blur}`;
}
export function cameraSummary(camera) {
  if (!camera.visible) return 'Hidden';
  return `${camera.shape === 'rounded' ? 'Rounded' : 'Circle'} · ${Math.round(camera.size * 100)}%${camera.mirror ? ' · Mirrored' : ''}`;
}
export function audioSummary({ voice }) {
  return `Microphone ${voice}%`; // music is "Coming soon" (AudioPanel)
}

/** Scene items (Figma: "Scene item"): Video · Background · Audio. Clicking the selected item again closes its panel. */
export default function SceneBar({ selection, onSelect, video, background, audio, camera = null }) {
  const items = [
    { id: 'video', label: 'Video', icon: 'video', summary: videoSummary(video, background) },
    { id: 'background', label: 'Background', icon: 'picture', summary: backgroundSummary(background) },
    // Only for recordings with a camera track.
    ...(camera ? [{ id: 'camera', label: 'Camera', icon: camera.visible ? 'camera' : 'camera-off', summary: cameraSummary(camera) }] : []),
    { id: 'audio', label: 'Audio', icon: 'volume', summary: audioSummary(audio) },
  ];
  return (
    <div className="scene-bar" role="group" aria-label="Scene">
      {items.map(item => {
        const selected = selection === item.id;
        return (
          <button key={item.id} type="button" className="scene-item" data-selected={selected || undefined}
            aria-pressed={selected} aria-expanded={selected} onClick={() => onSelect(item.id)}>
            <span className="scene-item__icon"><Icon name={item.icon} /></span>
            <span className="scene-item__text">
              <span className="scene-item__label">{item.label}</span>
              <span className="scene-item__summary">{item.summary}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
