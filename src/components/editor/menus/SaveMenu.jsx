import React, { useState } from 'react';
import { Button, Description, Input, Label, Popover, TextField } from '@heroui/react';
import Icon from '../../Icon';

function SaveOption({ icon, title, note, onPress, isDisabled }) {
  return (
    <button type="button" className="save-option" onClick={onPress} disabled={isDisabled}>
      <span className="save-option__icon"><Icon name={icon} /></span>
      <span className="save-option__text"><span className="save-option__title">{title}</span><span className="save-option__note">{note}</span></span>
    </button>
  );
}

/**
 * Save popover (Figma: "Save" on the 08 panels board): current project, new project (second step) or single recording.
 * `onSave({ mode, name })` resolves true when saved; the popover then closes.
 */
export default function SaveMenu({ projectName, onSave }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('choose');
  const [name, setName] = useState('Untitled project');
  const [busy, setBusy] = useState(false);

  function openChange(next) { setOpen(next); if (!next) { setStep('choose'); setBusy(false); } }
  async function save(mode) {
    setBusy(true);
    const ok = await onSave({ mode, name: mode === 'new' ? (name.trim() || 'Untitled project') : projectName });
    setBusy(false);
    if (ok) openChange(false);
  }

  return (
    <Popover isOpen={open} onOpenChange={openChange}>
      <Button isIconOnly variant="tertiary" size="sm" aria-label="Save"><Icon name="floppy-disk" /></Button>
      <Popover.Content placement="bottom end" offset={8} className="editor-save">
        <Popover.Dialog aria-label={step === 'new' ? 'Create new project' : 'Save your edits'} className="editor-save__dialog">
          {step === 'choose' ? <>
            <div className="editor-save__header">
              <Popover.Heading className="editor-save__heading">Save your edits</Popover.Heading>
              <span className="editor-save__sub">Choose where this recording is kept.</span>
            </div>
            <SaveOption icon="folder-check" title="Save to current project" isDisabled={!projectName || busy}
              note={projectName ? `${projectName} · updates it with your edits` : 'This recording is not in a project yet'} onPress={() => save('current')} />
            <SaveOption icon="folder-plus" title="Create new project" note="Start a project with this recording" isDisabled={busy} onPress={() => setStep('new')} />
            <SaveOption icon="video" title="Save as a single recording" note="Keeps it on its own, outside any project" isDisabled={busy} onPress={() => save('single')} />
          </> : (
            <form className="editor-save__form" onSubmit={e => { e.preventDefault(); save('new'); }}>
              <div className="editor-save__back">
                <Button isIconOnly variant="ghost" size="sm" aria-label="Back to save options" onPress={() => setStep('choose')}><Icon name="chevron-left" /></Button>
                <Popover.Heading className="editor-save__heading">Create new project</Popover.Heading>
              </div>
              <TextField value={name} onChange={setName} autoFocus fullWidth className="editor-save__field">
                <Label>Project name</Label>
                <Input placeholder="Untitled project" />
                <Description>This recording becomes its first item.</Description>
              </TextField>
              <div className="editor-save__actions">
                <Button variant="tertiary" size="sm" onPress={() => setStep('choose')}>Cancel</Button>
                <Button type="submit" size="sm" isDisabled={busy}>Create project</Button>
              </div>
            </form>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
