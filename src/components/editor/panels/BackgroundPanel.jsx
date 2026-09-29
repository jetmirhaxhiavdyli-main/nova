import React, { useRef, useState } from 'react';
import { ColorArea, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker } from '@heroui/react';
import PanelShell, { Segmented, SliderField } from './PanelShell';
import Icon from '../../Icon';
import { ANIMATED_BACKGROUNDS, BACKGROUND_IMAGES, GRADIENTS, IMAGE_FILL, IMAGE_SCALE, GRADIENT_STYLES, SMOOTH_GRADIENTS, SWATCHES, animatedCss, backgroundKind, gradientCss } from '../constants';

const TYPES = [{ id: 'none', label: 'None' }, { id: 'preset', label: 'Presets' }, { id: 'color', label: 'Color' }];
const KINDS = [{ id: 'gradient', label: 'Gradient' }, { id: 'animated', label: 'Animated' }, { id: 'image', label: 'Image' }];
const hex = color => (typeof color === 'string' ? color : color.toString('hex')).toLowerCase();
const MAX_UPLOAD = 2560; // uploads are downscaled so the project file stays small

function PresetTile({ selected, label, style, animated, onSelect, children }) {
  return <button type="button" role="radio" aria-checked={selected} aria-label={label} className={`preset-tile${animated ? ' bg-animated' : ''}`}
    data-selected={selected || undefined} style={style} onClick={onSelect}>{children}</button>;
}

const naturalSize = src => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error('Could not read that image.')); i.src = src; });

/** Reads an uploaded file into a downscaled JPEG data URL (saved with the project like any other edit). */
// Read as a data: URL — the app's CSP allows data: images but not blob: ones.
async function readUpload(file) {
  const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('Could not read that image.')); r.readAsDataURL(file); });
  const img = await naturalSize(dataUrl), k = Math.min(1, MAX_UPLOAD / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/jpeg', 0.9), width: c.width, height: c.height, name: file.name };
}

/** Background panel: None / Presets (Gradient · Animated · Image) / Color (swatches + custom). */
export default function BackgroundPanel({ background, set, onClose }) {
  const kind = backgroundKind(background);
  const gradients = background.style === 'smooth' ? SMOOTH_GRADIENTS : GRADIENTS;
  const fileRef = useRef(null);
  const [uploadError, setUploadError] = useState('');
  const image = background.image;

  function pickKind(next) {
    if (next === 'gradient') set('background', { kind: next, preset: typeof background.preset === 'number' ? background.preset : 0 });
    else if (next === 'animated') set('background', { kind: next, preset: ANIMATED_BACKGROUNDS[0].id });
    else if (image) set('background', { kind: next });
    else pickBuiltin(BACKGROUND_IMAGES[0]);
  }
  async function pickBuiltin(b) {
    const img = await naturalSize(b.src).catch(() => null);
    set('background', { kind: 'image', image: { id: b.id, width: img?.naturalWidth || 2560, height: img?.naturalHeight || 1440, x: 0, y: 0, scale: 1 } });
  }
  async function upload(file) {
    if (!file) return;
    setUploadError('');
    try { set('background', { kind: 'image', image: { ...(await readUpload(file)), x: 0, y: 0, scale: 1 } }); }
    catch (error) { setUploadError(error.message); }
  }

  return (
    <PanelShell title="Background" onClose={onClose}>
      <Segmented label="Background type" value={background.mode} options={TYPES} onChange={mode => set('background', { mode })} />

      {background.mode === 'none' && <p className="editor-panel__hint">Your recording plays edge to edge, exactly as captured. Pick a preset or color to frame it.</p>}

      {background.mode === 'preset' && <>
        <Segmented label="Preset type" value={kind} options={KINDS} onChange={pickKind} />

        {kind === 'gradient' && (
          <div className="editor-panel__field editor-panel__field--loose">
            <Segmented label="Gradient style" value={background.style === 'smooth' ? 'smooth' : 'hype'} options={GRADIENT_STYLES} onChange={style => set('background', { style })} />
            <div className="preset-grid" role="radiogroup" aria-label="Gradients">
              {gradients.map((gradient, i) => (
                <PresetTile key={i} selected={background.preset === i} label={`Gradient ${i + 1}`}
                  style={{ background: gradientCss(gradient) }} onSelect={() => set('background', { kind: 'gradient', preset: i })} />
              ))}
            </div>
          </div>
        )}

        {kind === 'animated' && (
          <div className="preset-grid" role="radiogroup" aria-label="Animated backgrounds">
            {ANIMATED_BACKGROUNDS.map(b => (
              <PresetTile key={b.id} animated selected={background.preset === b.id} label={`${b.label}, animated`}
                style={{ backgroundImage: animatedCss(b), '--bg-seconds': `${b.seconds}s` }} onSelect={() => set('background', { kind: 'animated', preset: b.id })} />
            ))}
          </div>
        )}

        {kind === 'image' && (
          <div className="editor-panel__field editor-panel__field--loose">
            <div className="preset-grid" role="radiogroup" aria-label="Background images">
              {BACKGROUND_IMAGES.map(b => (
                <PresetTile key={b.id} selected={image?.id === b.id} label={b.label}
                  style={{ backgroundImage: `url(${b.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }} onSelect={() => pickBuiltin(b)} />
              ))}
              {image?.src && <PresetTile selected label={`Your image, ${image.name || 'uploaded'}`} style={{ backgroundImage: `url(${image.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }} onSelect={() => {}} />}
              <PresetTile selected={false} label="Upload an image" onSelect={() => fileRef.current?.click()}>
                <Icon name="plus" size={16} />
              </PresetTile>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            {uploadError && <p className="editor-panel__hint" role="alert">{uploadError}</p>}
            {image && <>
              <SliderField label="Image size" value={Math.round((image.scale || 1) * 100)} min={IMAGE_SCALE.min * 100} max={IMAGE_SCALE.max * 100}
                onChange={v => set('background', { image: { ...image, scale: v / 100 } }, 'background.image.scale')} />
              {(image.scale || 1) < 1 && (
                <div className="editor-panel__field">
                  <span className="editor-panel__section-title">Around the image</span>
                  <ColorSwatchPicker className="editor-swatches" aria-label="Colour around the image" value={image.fill || IMAGE_FILL}
                    onChange={c => set('background', { image: { ...image, fill: hex(c) } })}>
                    {[IMAGE_FILL, ...SWATCHES.filter(c => c !== '#18181b')].map(color => (
                      <ColorSwatchPicker.Item key={color} color={color}>
                        <ColorSwatchPicker.Swatch />
                        <ColorSwatchPicker.Indicator />
                      </ColorSwatchPicker.Item>
                    ))}
                  </ColorSwatchPicker>
                </div>
              )}
              <SliderField label="Blur" value={image.blur || 0} min={0} max={100}
                onChange={v => set('background', { image: { ...image, blur: v } }, 'background.image.blur')} />
              <p className="editor-panel__hint">Drag the image around the recording to position it, or use the arrow keys. Double-click to centre it.</p>
            </>}
          </div>
        )}
      </>}

      {background.mode === 'color' && (
        <div className="editor-panel__field editor-panel__field--loose">
          <ColorSwatchPicker className="editor-swatches" aria-label="Colors" value={background.color} onChange={c => set('background', { color: hex(c) })}>
            {SWATCHES.map(color => (
              <ColorSwatchPicker.Item key={color} color={color}>
                <ColorSwatchPicker.Swatch />
                <ColorSwatchPicker.Indicator />
              </ColorSwatchPicker.Item>
            ))}
          </ColorSwatchPicker>
          <ColorPicker value={background.color} onChange={c => set('background', { color: hex(c) }, 'background.color')}>
            <ColorPicker.Trigger className="custom-color" aria-label={`Custom color, ${background.color.toUpperCase()}`}>
              <span className="custom-color__wheel"><ColorSwatch className="custom-color__swatch" /></span>
              <span className="custom-color__hex">{background.color.toUpperCase()}</span>
              <span className="custom-color__note">Custom</span>
            </ColorPicker.Trigger>
            <ColorPicker.Popover className="custom-color__popover">
              <ColorArea aria-label="Color" colorSpace="hsb" xChannel="saturation" yChannel="brightness"><ColorArea.Thumb /></ColorArea>
              <ColorSlider aria-label="Hue" channel="hue" colorSpace="hsb"><ColorSlider.Track><ColorSlider.Thumb /></ColorSlider.Track></ColorSlider>
            </ColorPicker.Popover>
          </ColorPicker>
        </div>
      )}
      {/* The space around the recording is set in the Video panel ("Video scale"). */}
    </PanelShell>
  );
}
