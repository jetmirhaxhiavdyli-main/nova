const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULTS = { screenshotShortcut: 'Control+Shift+5', startWithWindows: false };
const MODIFIERS = '(?:Control|Ctrl|CommandOrControl|CmdOrCtrl|Alt|Shift|Super|Meta)';
const KEY = '(?:[A-Z0-9]|F(?:[1-9]|1\\d|2[0-4])|Space|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Up|Down|Left|Right|Plus|[`\\-=\\[\\]\\\\;\',./])';
const ACCELERATOR = new RegExp(`^(?:${MODIFIERS}\\+)+${KEY}$`);

/** Lower-cased, modifier-order-independent form, so "Ctrl+Shift+X" and "Shift+Control+x" compare equal. */
function canonical(accelerator) {
  const parts = String(accelerator).toLowerCase().split('+').map(p => ({ ctrl: 'control', commandorcontrol: 'control', cmdorctrl: 'control' })[p] || p);
  const key = parts.pop();
  return [...new Set(parts)].sort().concat(key).join('+');
}

/** Global shortcuts need a modifier (a bare letter would hijack typing) and must not reuse a reserved key. */
function validAccelerator(accelerator, reserved = []) {
  return typeof accelerator === 'string' && ACCELERATOR.test(accelerator) && !reserved.some(r => canonical(r) === canonical(accelerator));
}

/** App settings in userData/settings.json: small, read once, written atomically. Invalid values fall back to defaults. */
function createSettings({ file, reserved = [] }) {
  const clean = raw => ({
    screenshotShortcut: validAccelerator(raw?.screenshotShortcut, reserved) ? raw.screenshotShortcut : DEFAULTS.screenshotShortcut,
    startWithWindows: raw?.startWithWindows === true,
  });
  let current;
  try { current = clean(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { current = clean({}); }
  return {
    get: () => ({ ...current }),
    /** Applies known keys only; throws on an invalid value so nothing is half-saved. */
    set(patch) {
      const next = { ...current };
      if (patch?.screenshotShortcut !== undefined) {
        if (!validAccelerator(patch.screenshotShortcut, reserved)) throw new Error('Invalid shortcut.');
        next.screenshotShortcut = patch.screenshotShortcut;
      }
      if (patch?.startWithWindows !== undefined) {
        if (typeof patch.startWithWindows !== 'boolean') throw new Error('Invalid setting.');
        next.startWithWindows = patch.startWithWindows;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(next));
      fs.renameSync(temporary, file);
      current = next;
      return { ...current };
    },
  };
}
module.exports = { createSettings, validAccelerator, canonical, DEFAULTS };
