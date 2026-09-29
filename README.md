# Nova

A free, open-source screen recorder and editor. Record a display, window or area, then polish the clip in the editor (backgrounds, zooms, cursor, camera and microphone, trim and cut) and export to MP4, WebM or GIF.

Built with Electron, React, [HeroUI](https://www.heroui.com) v3 and Tailwind CSS v4. Windows is the tested platform; macOS support exists but is untested.

## Features

- Display, window and area capture at up to 60 fps, with optional camera and microphone
- Auto-zoom on clicks, smooth cursor styles, editable zoom timeline
- Editor with gradient, image and animated backgrounds, trims, splits and deleted sections
- Export to MP4 (H.264), WebM (VP9) and GIF, with presets and quality levels (ffmpeg)
- Projects you can save and reopen
- Auto-update from GitHub Releases (installed Windows builds)

## Run from source

Requires Node.js 22.12+ and [pnpm](https://pnpm.io).

```
pnpm install
pnpm build
pnpm start
```

`pnpm dev` starts the Vite dev server for the UI only (the browser preview has no capture). Preview states are listed at the top of `src/main.jsx` (`?preview=export`, `?preview=editor`, and so on).

Stop a recording with Ctrl+Shift+X (Command+Shift+X on macOS) or the floating Stop button. On macOS, grant Screen Recording and Accessibility permission when asked.

## Build an installer

```
pnpm dist:win
```

The installer is written to `release/<version>/`. `pnpm release:win` also publishes it to GitHub Releases (needs a `GH_TOKEN`); the updater reads the repository set in `package.json` → `build.publish`, so change it if you fork. Installers are unsigned, so Windows SmartScreen may warn.

## Tests

Most tests run with plain Node: `node --test tests/<file>`. On a machine without Node on the PATH, run them through Electron: `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron.exe --test tests/<file>`.

## Layout

- `src/`: React UI (recorder toolbar, pickers, editor, export dialog)
- `electron/`: main process, capture, export (ffmpeg), projects, updater
- `scripts/`: benchmark and validation scripts
- `tests/`: unit tests

## License

Nova is released under the [MIT License](LICENSE). It bundles ffmpeg through `ffmpeg-static`/`ffprobe-static`, which are distributed under their own licenses (the ffmpeg build may be GPL); check them before redistributing installers. The Inter font is under the SIL Open Font License (`src/assets/fonts/Inter-OFL.txt`).
