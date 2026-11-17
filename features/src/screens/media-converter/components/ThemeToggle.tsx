import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '../icons';

interface LauncherConfig {
  theme?: string;
  [key: string]: unknown;
}

interface LauncherApi {
  getConfig?: () => Promise<LauncherConfig>;
  saveConfig?: (cfg: LauncherConfig) => Promise<LauncherConfig>;
  onEvent?: (cb: (ev: { type?: string; theme?: string }) => void) => void;
}

function launcher(): LauncherApi | undefined {
  return (window as unknown as { launcher?: LauncherApi }).launcher;
}

function resolveTheme(choice?: string): 'light' | 'dark' {
  if (choice === 'light' || choice === 'dark') return choice;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// Theme is owned by the launcher config so it stays in sync across every
// service screen; toggling here broadcasts theme:changed to all views.
export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme !== 'light',
  );

  useEffect(() => {
    const api = launcher();
    api?.getConfig?.()
      .then((cfg) => setDark(resolveTheme(cfg?.theme) === 'dark'))
      .catch(() => undefined);
    api?.onEvent?.((ev) => {
      if (ev?.type === 'theme:changed') {
        setDark(resolveTheme(ev.theme) === 'dark');
      }
    });
  }, []);

  const toggle = async () => {
    const next = dark ? 'light' : 'dark';
    setDark(!dark);
    document.documentElement.dataset.theme = next;
    const api = launcher();
    try {
      const cfg = await api?.getConfig?.();
      if (api?.saveConfig) {
        await api.saveConfig({ ...(cfg ?? {}), theme: next });
      }
    } catch {
      /* local change still applied */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-mut transition-colors duration-[120ms] hover:bg-hover hover:text-ink"
    >
      {dark ? <SunIcon aria-hidden className="h-5 w-5" /> : <MoonIcon aria-hidden className="h-5 w-5" />}
    </button>
  );
}