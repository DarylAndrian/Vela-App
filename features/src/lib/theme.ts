/** Applies the launcher theme (from config) to this page; listens for runtime changes. */
export async function initTheme(): Promise<void> {
  const launcher = (window as any).launcher;
  const resolve = (choice?: string) => {
    if (choice === 'system' || !choice) {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return choice;
  };
  if (launcher?.getConfig) {
    try {
      const cfg = await launcher.getConfig();
      document.documentElement.dataset.theme = resolve(cfg.theme);
    } catch { /* default stays */ }
  }
  if (launcher?.onEvent) {
    launcher.onEvent((ev: { type?: string; theme?: string }) => {
      if (ev.type === 'theme:changed' && ev.theme) {
        document.documentElement.dataset.theme = resolve(ev.theme);
      }
    });
  }
}
