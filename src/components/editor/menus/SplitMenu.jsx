import React from 'react';
import { Button, Dropdown } from '@heroui/react';
import Icon from '../../Icon';
import { SPLIT_TARGETS, formatTime } from '../constants';

/** Which rows an option cuts, drawn as a tiny two-track diagram. */
function SplitDiagram({ target }) {
  return (
    <span className="split-diagram" data-target={target} aria-hidden="true">
      <span className="split-diagram__video" /><span className="split-diagram__audio" /><span className="split-diagram__cut" />
    </span>
  );
}

/**
 * Split ▾ (Figma: "Split menu"). Opens upward. Hovering or focusing an option previews the cut
 * on the affected rows through `onPreview(target | null)`.
 */
export default function SplitMenu({ time, onSplit, onPreview, isDisabled }) {
  return (
    <Dropdown onOpenChange={open => { if (!open) onPreview(null); }}>
      <Button variant="ghost" size="sm" isDisabled={isDisabled}><Icon name="scissors" />Split<Icon name="chevron-down" size={12} /></Button>
      <Dropdown.Popover placement="top start" className="editor-menu editor-menu--split">
        <span className="editor-menu__title" aria-hidden="true">Split at {formatTime(time)}</span>
        <Dropdown.Menu aria-label={`Split at ${formatTime(time)}`} onAction={key => { onPreview(null); onSplit(String(key)); }}>
          {SPLIT_TARGETS.map(option => (
            <Dropdown.Item key={option.id} id={option.id} textValue={option.label} className="editor-menu__item editor-menu__item--tall"
              onHoverChange={hovered => onPreview(hovered ? option.id : null)} onFocusChange={focused => onPreview(focused ? option.id : null)}>
              <SplitDiagram target={option.id} />
              <span className="editor-menu__text"><span className="editor-menu__label">{option.label}</span><span className="editor-menu__note">{option.note}</span></span>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
