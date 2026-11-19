import { useEffect, useState, type KeyboardEvent } from 'react';
import { AudioIcon, CompressIcon, EditIcon, EraserIcon, ImageIcon, VideoIcon } from './icons';
import { ConvertTool } from './tools/ConvertTool';
import { CompressTool } from './tools/CompressTool';
import { EditTool } from './tools/EditTool';
import { VideoTool } from './tools/VideoTool';
import { VideoToAudioTool } from './tools/VideoToAudioTool';
import { RemoveBackgroundTool } from './tools/RemoveBackgroundTool';

const MODES = [
  { route: '/convert', label: 'Convert images', icon: ImageIcon, component: ConvertTool },
  { route: '/compress', label: 'Compress images', icon: CompressIcon, component: CompressTool },
  { route: '/video', label: 'Convert video', icon: VideoIcon, component: VideoTool },
  { route: '/video-to-audio', label: 'Extract audio', icon: AudioIcon, component: VideoToAudioTool },
  { route: '/remove-background', label: 'Remove background', icon: EraserIcon, component: RemoveBackgroundTool },
  { route: '/edit', label: 'Edit image', icon: EditIcon, component: EditTool },
] as const;

function readMode() {
  return Math.max(0, MODES.findIndex((mode) => '#' + mode.route === window.location.hash));
}

export function MediaConverterApp() {
  const [active, setActive] = useState(readMode);
  const [visited, setVisited] = useState(() => new Set([active]));

  function selectMode(index: number) {
    setActive(index);
    setVisited((previous) => previous.has(index) ? previous : new Set([...previous, index]));
  }

  useEffect(() => {
    const onChange = () => selectMode(readMode());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  function activate(index: number) {
    window.history.replaceState(null, '', '#' + MODES[index].route);
    selectMode(index);
  }

  function handleModeKey(event: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = {
      ArrowLeft: (active + MODES.length - 1) % MODES.length,
      ArrowRight: (active + 1) % MODES.length,
      Home: 0,
      End: MODES.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    activate(next);
    document.getElementById('media-mode-' + next)?.focus();
  }

  return (
    <div className="mc-workspace bg-bg text-ink">
      <div className="mc-modes" role="tablist" aria-label="Media tools" onKeyDown={handleModeKey}>
        {MODES.map((mode, index) => (
          <button key={mode.route} type="button" role="tab" id={'media-mode-' + index}
            aria-selected={active === index} aria-controls={'media-panel-' + index}
            tabIndex={active === index ? 0 : -1} onClick={() => activate(index)}>
            <mode.icon className="h-4 w-4" aria-hidden />
            {mode.label}
          </button>
        ))}
      </div>
      {MODES.map((mode, index) => (
        <section key={mode.route} className="mc-mode-panel" id={'media-panel-' + index}
          role="tabpanel" aria-labelledby={'media-mode-' + index} hidden={active !== index}>
          {visited.has(index) && <mode.component />}
        </section>
      ))}
    </div>
  );
}
