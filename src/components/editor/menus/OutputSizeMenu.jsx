import React, { useEffect, useState } from 'react';
import { Button, Dropdown } from '@heroui/react';
import Icon from '../../Icon';
import { CUSTOM_MAX, CUSTOM_MIN, OUTPUT_SIZES } from '../constants';

const RATIOS = [[16, 9], [9, 16], [1, 1], [4, 3], [3, 4], [21, 9], [16, 10]];
/** "16:9" for common shapes, otherwise "Original". */
export function ratioLabel({ width, height }) {
  const match = RATIOS.find(([w, h]) => Math.abs(width / height - w / h) < 0.01);
  return match ? `${match[0]}:${match[1]}` : 'Original';
}
const dims = ({ width, height }) => `${width} × ${height}`;

const clampDim = v => Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(Number(v) || 0)));

/** Exact canvas size; the recording is fitted inside it and the background fills the rest. Applies on Enter or the button. */
function CustomSize({ active, output, onApply }) {
  const [w, setW] = useState(String(output.width)), [h, setH] = useState(String(output.height));
  useEffect(() => { setW(String(output.width)); setH(String(output.height)); }, [output.width, output.height]);
  const apply = () => onApply({ width: clampDim(w), height: clampDim(h) });
  const keys = e => { if (e.key === 'Enter') apply(); e.stopPropagation(); };
  return (
    <div className="editor-custom" data-active={active || undefined}>
      <span className="editor-custom__title">Custom size</span>
      <div className="editor-custom__row">
        <input type="number" min={CUSTOM_MIN} max={CUSTOM_MAX} value={w} onChange={e => setW(e.target.value)} onKeyDown={keys} aria-label="Custom width in pixels" />
        <span aria-hidden="true">×</span>
        <input type="number" min={CUSTOM_MIN} max={CUSTOM_MAX} value={h} onChange={e => setH(e.target.value)} onKeyDown={keys} aria-label="Custom height in pixels" />
        <Button size="sm" variant="secondary" onPress={apply}>Apply</Button>
      </div>
    </div>
  );
}

/** Header output size button + menu (Figma: "Output size" on the 08 panels board). */
export default function OutputSizeMenu({ value, output, source, onChange }) {
  return (
    <Dropdown>
      <Button variant="tertiary" size="sm" className="editor-size" aria-label={`Output size: ${ratioLabel(output)}, ${dims(output)}`}>
        <Icon name="crop" />
        <span className="editor-size__label">{ratioLabel(output)} · {dims(output)}</span>
        <Icon name="chevron-down" size={12} className="editor-size__chevron" />
      </Button>
      <Dropdown.Popover placement="bottom" className="editor-menu editor-menu--size">
        <span className="editor-menu__title" aria-hidden="true">Output size</span>
        <Dropdown.Menu aria-label="Output size" selectionMode="single" selectedKeys={new Set([value])}
          onSelectionChange={keys => { const [key] = keys; if (key) onChange(String(key)); }}>
          {OUTPUT_SIZES.map(option => {
            const size = option.width ? option : source;
            return (
              <Dropdown.Item key={option.id} id={option.id} textValue={option.label} className="editor-menu__item">
                {({ isSelected }) => <>
                  <span className="editor-ratio" aria-hidden="true"><span style={{ width: option.glyph[0], height: option.glyph[1] }} data-selected={isSelected || undefined} /></span>
                  <span className="editor-menu__label">{option.short ? <>{option.label} · {option.short}</> : option.label}</span>
                  <span className="editor-menu__meta">{dims(size)}</span>
                  <span className="editor-menu__check">{isSelected && <Icon name="check" size={12} />}</span>
                </>}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
        <CustomSize active={value === 'custom'} output={output} onApply={size => onChange('custom', size)} />
      </Dropdown.Popover>
    </Dropdown>
  );
}
