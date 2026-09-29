import React from 'react';
import { Button } from '@heroui/react';
import Icon from './Icon';

const format = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * Small, non-obstructive control shown while recording (Figma component "Toolbar/Recording HUD").
 * Stop is also bound to Ctrl/⌘ + Shift + X in electron/main.cjs.
 */
export default function RecordingHud({ seconds, paused, onPauseToggle, onRestart, onDiscard, onStop, stopping }) {
  return (
    <div className="hud" role="toolbar" aria-label="Recording controls" data-paused={paused || undefined}>
      <div className="hud__timer" aria-live="polite">
        <span className="hud__dot" aria-hidden="true" />
        <span className="hud__time">{paused ? 'Paused' : format(seconds)}</span>
      </div>
      <span className="hud__separator" aria-hidden="true" />
      <Button size="sm" variant="ghost" isIconOnly aria-label={paused ? 'Resume recording' : 'Pause recording'} onPress={onPauseToggle} isDisabled={stopping}>
        <Icon name={paused ? 'play' : 'pause'} />
      </Button>
      <Button size="sm" variant="ghost" isIconOnly aria-label="Restart recording" onPress={onRestart} isDisabled={stopping}>
        <Icon name="restart" />
      </Button>
      <Button size="sm" variant="ghost" isIconOnly aria-label="Discard recording" onPress={onDiscard} isDisabled={stopping}>
        <Icon name="trash" />
      </Button>
      <Button size="sm" variant="danger" isIconOnly aria-label="Stop recording" onPress={onStop} isDisabled={stopping}>
        <Icon name="stop" />
      </Button>
    </div>
  );
}
