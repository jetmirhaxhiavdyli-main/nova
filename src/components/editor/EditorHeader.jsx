import React from 'react';
import { Button } from '@heroui/react';
import Icon from '../Icon';
import OutputSizeMenu from './menus/OutputSizeMenu';
import SaveMenu from './menus/SaveMenu';

/** Header (56px, 3 columns): back · title · status | output size | undo · redo · save · export. */
export default function EditorHeader({ name, saved, outputSize, output, source, onOutputSize, canUndo, canRedo, onUndo, onRedo, projectName, onSave, onBack, onExport }) {
  return (
    <header className="editor-header">
      <div className="editor-header__start">
        <Button isIconOnly variant="ghost" size="sm" aria-label="Back to your recording" onPress={onBack}><Icon name="chevron-left" /></Button>
        <Icon name="brand" size={20} className="brand-mark" />
        <span className="editor-header__name">{name}</span>
        <span className="editor-header__status" role="status">{saved ? 'Saved just now' : 'Edited just now'}</span>
      </div>
      <div className="editor-header__center">
        <OutputSizeMenu value={outputSize} output={output} source={source} onChange={onOutputSize} />
      </div>
      <div className="editor-header__end">
        <Button isIconOnly variant="ghost" size="sm" aria-label="Undo" isDisabled={!canUndo} onPress={onUndo}><Icon name="undo" /></Button>
        <Button isIconOnly variant="ghost" size="sm" aria-label="Redo" isDisabled={!canRedo} onPress={onRedo}><Icon name="redo" /></Button>
        <span className="editor-header__separator" aria-hidden="true" />
        <SaveMenu projectName={projectName} onSave={onSave} />
        <Button variant="ghost" size="sm" onPress={()=>window.dispatchEvent(new Event('show-about'))}>About</Button>
        <Button size="sm" onPress={onExport}><Icon name="arrow-down-to-line" />Export</Button>
        {window.recorder && <>
          <span className="editor-header__separator" aria-hidden="true" />
          <Button isIconOnly variant="ghost" size="sm" aria-label="Minimize Nova" onPress={() => window.recorder.minimizeWindow()}><span aria-hidden="true">−</span></Button>
          <Button isIconOnly variant="ghost" size="sm" aria-label="Close Nova" onPress={() => window.recorder.closeWindow()}><Icon name="close" size={12} /></Button>
        </>}
      </div>
    </header>
  );
}
