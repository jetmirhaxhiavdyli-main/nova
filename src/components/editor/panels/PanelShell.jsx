import React from 'react';
import { Button, Description, Label, Slider, Switch, Tabs } from '@heroui/react';
import Icon from '../../Icon';

/** Floating, non-modal panel shared by Video, Background, Audio and Zoom (Figma: panel shell). */
export default function PanelShell({ title, onClose, actions, className = '', style, children }) {
  return (
    <section role="dialog" aria-label={`${title} settings`} className={`editor-panel ${className}`} style={style}>
      <div className="editor-panel__header">
        <h2 className="editor-panel__title">{title}</h2>
        {actions}
        <Button isIconOnly variant="ghost" size="sm" aria-label={`Close ${title.toLowerCase()} settings`} onPress={onClose}><Icon name="close" size={12} /></Button>
      </div>
      {children}
    </section>
  );
}

export function PanelSection({ title, children }) {
  return (
    <div className="editor-panel__section">
      {title && <span className="editor-panel__section-title">{title}</span>}
      {children}
    </div>
  );
}

export const PanelSeparator = () => <div className="editor-panel__separator" role="separator" />;

/** HeroUI Slider with label + value. `format` turns the value into the output text. */
export function SliderField({ label, value, onChange, min = 0, max = 100, step = 1, format = v => `${v}%` }) {
  return (
    <Slider className="editor-slider" value={value} onChange={v => onChange(Array.isArray(v) ? v[0] : v)} minValue={min} maxValue={max} step={step}>
      <Label>{label}</Label>
      <Slider.Output>{format(value)}</Slider.Output>
      <Slider.Track>
        <Slider.Fill />
        <Slider.Thumb />
      </Slider.Track>
    </Slider>
  );
}

/** Segmented choice built on HeroUI Tabs (no panels), as in the Export modal. */
export function Segmented({ label, value, options, onChange }) {
  return (
    <Tabs className="editor-tabs" selectedKey={value} onSelectionChange={key => onChange(String(key))}>
      <Tabs.ListContainer>
        <Tabs.List aria-label={label}>
          {options.map(o => <Tabs.Tab key={o.id} id={o.id}>{o.label}<Tabs.Indicator /></Tabs.Tab>)}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}

/** A setting that isn't connected yet: its label with a "Coming soon" chip instead of a control. */
export function ComingSoonField({ label }) {
  return (
    <div className="coming-soon-field" aria-label={`${label}, coming soon`}>
      <span>{label}</span><span className="coming-soon__chip">Coming soon</span>
    </div>
  );
}

export function SwitchField({ label, isSelected, onChange, description }) {
  return (
    <Switch className="editor-switch" isSelected={isSelected} onChange={onChange}>
      <Switch.Content>
        <Switch.Control><Switch.Thumb /></Switch.Control>
        <Label>{label}</Label>
      </Switch.Content>
      {description && <Description>{description}</Description>}
    </Switch>
  );
}
