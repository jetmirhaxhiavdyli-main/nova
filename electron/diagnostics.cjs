// Local diagnostics log (userData/logs/nova.log) for problems on testers' PCs: updater steps and recording start-up.
// Never contains recording content, keys, file names or device names, only statuses, timings and error messages.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function createDiagnostics(app) {
  const dir = path.join(app.getPath('userData'), 'logs'), file = path.join(dir, 'nova.log');
  const MAX = 1024 * 1024;
  function write(level, parts) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      try { if (fs.statSync(file).size > MAX) fs.renameSync(file, file + '.old'); } catch {}
      const text = parts.map(p => p instanceof Error ? p.message : typeof p === 'string' ? p : JSON.stringify(p)).join(' ').replace(/\s+/g, ' ').slice(0, 2000);
      fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${text}\n`);
    } catch {}
  }
  const log = { info: (...a) => write('INFO', a), warn: (...a) => write('WARN', a), error: (...a) => write('ERROR', a), debug: () => {} };
  log.info(`Nova ${app.getVersion()} started · ${os.type()} ${os.release()} ${os.arch()} · packaged=${app.isPackaged} · exe=${app.isPackaged ? path.dirname(process.execPath) : 'dev'}`);
  return { log, dir, file };
}
module.exports = { createDiagnostics };
