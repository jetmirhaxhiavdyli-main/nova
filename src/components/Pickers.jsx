import React, { useEffect, useRef, useState } from 'react';
import { Button, Dropdown } from '@heroui/react';
import Icon from './Icon';

/** Popover shell shared by every list above the toolbar (Figma: "Display picker" etc.). */
export function Panel({ title, meta, footer, children, label }) {
  return (
    <section className="panel" aria-label={label || title}>
      <header className="panel__header">
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </header>
      <div className="panel__rows">{children}</div>
      {footer && <>
        <div className="panel__separator" aria-hidden="true" />
        <footer className="panel__footer">{footer}</footer>
      </>}
    </section>
  );
}

function Footer({ hint, action, onAction, isDisabled }) {
  return <>
    <span>{hint}</span>
    <Button size="sm" onPress={onAction} isDisabled={isDisabled}>{action}</Button>
  </>;
}

/** One selectable source (Figma component "Picker/Row"). */
export function PickerRow({ name, meta, selected, thumbnail, onSelect, onActivate }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className="picker-row" data-selected={selected || undefined}
      onClick={onSelect} onDoubleClick={onActivate}>
      <span className="picker-row__thumb">{thumbnail}</span>
      <span className="picker-row__text">
        <span className="picker-row__name">{name}</span>
        {meta && <span className="picker-row__meta">{meta}</span>}
      </span>
      {selected && <span className="picker-row__check"><Icon name="check" size={12} /></span>}
    </button>
  );
}

/* ---------- Thumbnails ---------- */

const DISPLAY_WALLS = ['#4a5a6e', '#6b5a48', '#56606c', '#5b4a63'];

function DisplayThumb({ src, index }) {
  if (src) return <img src={src} alt="" />;
  return <span className="thumb-display" style={{ background: DISPLAY_WALLS[index % DISPLAY_WALLS.length] }}>
    <span className="thumb-display__a" /><span className="thumb-display__b" />
  </span>;
}

function WindowThumb({ src, tone }) {
  if (src) return <img src={src} alt="" />;
  return <span className="thumb-window"><span style={{ background: tone || '#fafafa' }} /></span>;
}

function RatioThumb({ width, height }) {
  return <span className="thumb-ratio"><span style={{ width, height }} /></span>;
}

/* ---------- Pickers ---------- */

export function DisplayPicker({ displays, selectedId, onSelect, onRecord, busy }) {
  return (
    <Panel title="Choose a display" meta={`${displays.length} ${displays.length === 1 ? 'display' : 'displays'}`}
      footer={<Footer hint="Records the whole screen" action="Record" onAction={onRecord} isDisabled={!selectedId || busy} />}>
      <div role="radiogroup" aria-label="Displays" className="panel__group">
        {displays.map((d, i) => (
          <PickerRow key={d.id} name={d.name} meta={d.meta} selected={d.id === selectedId}
            thumbnail={<DisplayThumb src={d.thumbnail} index={i} />}
            onSelect={() => onSelect(d.id)} onActivate={onRecord} />
        ))}
        {!displays.length && <p className="panel__empty">Looking for displays…</p>}
      </div>
    </Panel>
  );
}

export function WindowPicker({ windows, selectedId, onSelect, onRecord, busy }) {
  return (
    <Panel title="Choose a window" meta={`${windows.length} open ${windows.length === 1 ? 'window' : 'windows'}`}
      footer={<Footer hint="Or click any window on screen" action="Record" onAction={onRecord} isDisabled={!selectedId || busy} />}>
      <div role="radiogroup" aria-label="Windows" className="panel__group panel__group--scroll">
        {windows.map(w => (
          <PickerRow key={w.id} name={w.name} meta={w.meta} selected={w.id === selectedId}
            thumbnail={<WindowThumb src={w.thumbnail} tone={w.tone} />}
            onSelect={() => onSelect(w.id)} onActivate={onRecord} />
        ))}
        {!windows.length && <p className="panel__empty">No windows to record yet.</p>}
      </div>
    </Panel>
  );
}

export const AREA_PRESETS = [
  { id: 'custom', name: 'Custom area', glyph: [38, 26] },
  { id: '16:9', name: 'Widescreen 16:9', meta: '1920 × 1080', glyph: [40, 22.5], ratio: 16 / 9 },
  { id: '4:3', name: 'Standard 4:3', meta: '1440 × 1080', glyph: [32, 24], ratio: 4 / 3 },
];

/** Exact area size in screen pixels; commits on blur/Enter, clamped to 120px..screen. */
function SizeFields({ size, max, onSize }) {
  const commit = (key, raw) => {
    const v = Math.min(max[key], Math.max(120, Math.round(Number(raw) || 0)));
    if (v !== size[key]) onSize({ ...size, [key]: v });
  };
  return (
    <div className="area-size">
      {['width', 'height'].map(key => (
        <label key={key}>{key === 'width' ? 'W' : 'H'}
          <input type="number" min={120} max={max[key]} defaultValue={size[key]} key={`${key}-${size[key]}`} aria-label={`Area ${key} in pixels`}
            onBlur={e => commit(key, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>
      ))}
    </div>
  );
}

export function AreaPicker({ presetId, customSize, onSelect, onSize, max, onRecord, busy }) {
  return (
    <Panel title="Choose an area" meta="Drag on screen to adjust"
      footer={<Footer hint="Custom recording area" action="Record area" onAction={onRecord} isDisabled={busy} />}>
      <div role="radiogroup" aria-label="Area size" className="panel__group">
        {AREA_PRESETS.map(p => (
          <PickerRow key={p.id} name={p.name} selected={p.id === presetId}
            meta={p.id === 'custom' ? `${customSize.width} × ${customSize.height} · last used` : p.meta}
            thumbnail={<RatioThumb width={p.glyph[0]} height={p.glyph[1]} />}
            onSelect={() => onSelect(p.id)} onActivate={onRecord} />
        ))}
      </div>
      <SizeFields size={customSize} max={max} onSize={onSize} />
    </Panel>
  );
}

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M10.5 2.5l3 3L5.5 13.5H2.5v-3l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

/** Inline name field for rename / new folder: Enter or blur commits, Esc cancels. */
function NameInput({ initial = '', label, busy, onCommit, onCancel }) {
  const [value, setValue] = useState(initial), input = useRef(null), done = useRef(false);
  useEffect(() => { input.current?.select(); }, []);
  const commit = () => {
    if (done.current) return; done.current = true;
    const next = value.trim();
    if (!next || next === initial) onCancel(); else onCommit(next);
  };
  return <input ref={input} className="recent-row__input" value={value} maxLength={160} aria-label={label} disabled={busy} placeholder={label}
    onChange={e => { done.current = false; setValue(e.target.value); }} onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { e.stopPropagation(); done.current = true; onCancel(); } }} />;
}

/**
 * One row in Recent recordings (a recording or a folder): open on click; hover actions to rename,
 * move (recordings) and delete with an inline confirm.
 */
function ListRow({ label, thumb, name, meta, trailing, onOpen, onRename, onDelete, deleteMeta, moveMenu }) {
  const [mode, setMode] = useState(null); // null | 'rename' | 'delete'
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(action) {
    setBusy(true); setError('');
    try { await action(); setMode(null); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const errorLine = error && <p className="recent-item__error" role="alert">{error}</p>;
  if (mode === 'rename') return (
    <li className="recent-item" data-mode="rename">
      <div className="recent-row">{thumb}<NameInput initial={name} label={`${label} name`} busy={busy} onCancel={() => setMode(null)} onCommit={next => run(() => onRename(next))} /></div>
      {errorLine}
    </li>
  );
  if (mode === 'delete') return (
    <li className="recent-item" data-mode="delete">
      <div className="recent-row recent-row--confirm">
        {thumb}
        <span className="picker-row__text">
          <span className="picker-row__name">Delete “{name}”?</span>
          <span className="picker-row__meta">{deleteMeta}</span>
        </span>
        <span className="recent-item__confirm">
          <Button size="sm" variant="tertiary" isDisabled={busy} onPress={() => setMode(null)}>Cancel</Button>
          <Button size="sm" variant="danger" isDisabled={busy} onPress={() => run(onDelete)}>Delete</Button>
        </span>
      </div>
      {errorLine}
    </li>
  );
  return (
    <li className="recent-item">
      <button type="button" className="recent-row" onClick={onOpen}>
        {thumb}
        <span className="picker-row__text">
          <span className="picker-row__name">{name}</span>
          <span className="picker-row__meta">{meta}</span>
        </span>
        <span className="recent-row__duration">{trailing}</span>
      </button>
      {(onRename || onDelete || moveMenu) && (
        <span className="recent-item__actions">
          {onRename && <button type="button" className="recent-item__action" aria-label={`Rename ${name}`} title="Rename" onClick={() => setMode('rename')}><PencilIcon /></button>}
          {moveMenu}
          {onDelete && <button type="button" className="recent-item__action" aria-label={`Delete ${name}`} title="Delete" onClick={() => setMode('delete')}><Icon name="trash" size={14} /></button>}
        </span>
      )}
      {errorLine}
    </li>
  );
}

/** "Move to folder" menu for a recording: the top level plus every folder (the current one is checked). */
function MoveMenu({ recording, folders, onMove }) {
  const items = [{ id: 'top', name: 'Recent recordings (no folder)' }, ...folders];
  const current = recording.folderId || 'top';
  return (
    <Dropdown>
      <Button isIconOnly variant="ghost" size="sm" className="recent-item__action" aria-label={`Move ${recording.name} to a folder`}><Icon name="folder" size={14} /></Button>
      <Dropdown.Popover placement="top end" className="editor-menu recent-menu">
        <span className="editor-menu__title" aria-hidden="true">Move to</span>
        <Dropdown.Menu aria-label={`Move ${recording.name} to`} disabledKeys={[current]} onAction={key => onMove(recording, key === 'top' ? null : String(key))}>
          {items.map(f => (
            <Dropdown.Item key={f.id} id={f.id} textValue={f.name} className="editor-menu__item">
              <Icon name={f.id === 'top' ? 'list' : 'folder'} size={14} />
              <span className="editor-menu__label">{f.name}</span>
              {f.id === current && <Icon name="check" size={12} className="recent-menu__check" />}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

const RecordingThumb = ({ r }) => (
  <span className="recent-row__thumb" style={{ background: r.wall || '#a3b5a0' }}>
    {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <span style={{ background: r.window || '#fafafa' }} />}
  </span>
);
const FolderThumb = () => <span className="recent-row__thumb recent-row__thumb--folder"><Icon name="folder" size={18} /></span>;
const count = n => `${n} ${n === 1 ? 'recording' : 'recordings'}`;

/**
 * Past recordings (Figma component "Recordings/Row"), organised in folders.
 * Top level: folders first, then recordings without a folder. Opening a folder lists its recordings.
 * Folder actions are optional: without `onCreateFolder` etc. the panel is a plain list.
 */
export function RecentRecordings({ recordings, folders = [], onOpen, onRename, onDelete, onMove, onCreateFolder, onRenameFolder, onDeleteFolder }) {
  const [openId, setOpenId] = useState(null), [creating, setCreating] = useState(false), [error, setError] = useState('');
  const open = folders.find(f => f.id === openId) || null; // a deleted folder falls back to the top level
  const known = new Set(folders.map(f => f.id));
  const inFolder = id => recordings.filter(r => r.folderId === id);
  const shown = open ? inFolder(open.id) : recordings.filter(r => !r.folderId || !known.has(r.folderId));
  async function create(name) {
    setError('');
    try { const folder = await onCreateFolder(name); setCreating(false); if (folder?.id) setOpenId(null); }
    catch (e) { setError(e.message); setCreating(false); }
  }
  const title = open
    ? <span className="recents__crumb"><button type="button" className="recent-item__action" aria-label="Back to all recordings" onClick={() => setOpenId(null)}><Icon name="chevron-left" size={14} /></button>{open.name}</span>
    : 'Recent recordings';
  const meta = !open && onCreateFolder
    ? <button type="button" className="recents__new" onClick={() => { setError(''); setCreating(true); }}><Icon name="folder-plus" size={14} />New folder</button>
    : count(open ? shown.length : recordings.length);
  return (
    <Panel title={title} label={open ? `Folder ${open.name}` : 'Recent recordings'} meta={meta}>
      <ul className="panel__group recents">
        {creating && (
          <li className="recent-item" data-mode="rename">
            <div className="recent-row"><FolderThumb /><NameInput label="Folder name" onCommit={create} onCancel={() => setCreating(false)} /></div>
          </li>
        )}
        {error && <li><p className="recent-item__error" role="alert">{error}</p></li>}
        {!open && folders.map(f => (
          <ListRow key={f.id} label="Folder" thumb={<FolderThumb />} name={f.name} meta={count(inFolder(f.id).length)} trailing={<Icon name="chevron-left" size={12} className="recents__chevron" />}
            onOpen={() => setOpenId(f.id)} onRename={onRenameFolder && (name => onRenameFolder(f, name))} onDelete={onDeleteFolder && (() => onDeleteFolder(f))}
            deleteMeta="Its recordings move back here. Nothing is deleted." />
        ))}
        {shown.map(r => (
          <ListRow key={r.id} label="Recording" thumb={<RecordingThumb r={r} />} name={r.name} meta={r.date} trailing={r.duration}
            onOpen={() => onOpen(r)} onRename={onRename && (name => onRename(r, name))} onDelete={onDelete && (() => onDelete(r))}
            deleteMeta="The video and edits are removed from this PC."
            moveMenu={onMove && folders.length > 0 && <MoveMenu recording={r} folders={folders} onMove={onMove} />} />
        ))}
        {!shown.length && !creating && (open || !folders.length) && (
          <li className="panel__empty">{open ? 'No recordings here yet. Use the folder button on a recording to move it here.' : 'Your recordings will show up here.'}</li>
        )}
      </ul>
    </Panel>
  );
}

