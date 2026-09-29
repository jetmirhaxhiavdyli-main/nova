import React from 'react';
import { Button, Dropdown } from '@heroui/react';
import Icon from '../../Icon';
import { OUTPUT_SIZES } from '../constants';

const RATIOS = [[16, 9], [9, 16], [1, 1], [4, 3], [3, 4], [21, 9], [16, 10]];
/** "16:9" for common shapes, otherwise "Original". */
export function ratioLabel({ width, height }) {
  const match = RATIOS.find(([w, h]) => Math.abs(width / height - w / h) < 0.01);
  return match ? `${match[0]}:${match[1]}` : 'Original';
}
const dims = ({ width, height }) => `${width} × ${height}`;

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
        <Dropdown.Menu aria-label="Output size" selectionMode="single" selectedKeys={new Set([value])} disabledKeys={['custom']}
          onSelectionChange={keys => { const [key] = keys; if (key && key !== 'custom') onChange(String(key)); }}>
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
          {/* TODO(codex): custom output dimensions. The Figma board shows the entry only. */}
          <Dropdown.Item id="custom" textValue="Custom size" className="editor-menu__item">
            <span className="editor-ratio" aria-hidden="true"><Icon name="plus" size={14} /></span>
            <span className="editor-menu__label">Custom size…</span>
            <span className="editor-menu__meta"><span className="coming-soon__chip">Coming soon</span></span>
            <span className="editor-menu__check" />
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
