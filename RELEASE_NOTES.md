## Nova 1.2.2

- Better recording quality: screens are now encoded with ffmpeg at a constant frame rate (your GPU's NVENC, AMD or Intel encoder when available), instead of the browser recorder.
- Smoother exports: frames are picked from the recording's real timing, so animations no longer stutter or mix.
- Background "None" now exports pixel-exact at the recording's own size.
- New option: record at 30 or 60 fps (in About).
