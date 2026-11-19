/** Applies Vela's saved appearance to both visible and retained workspaces. */
export async function initTheme(): Promise<void> {
  const launcher = (window as any).launcher;
  const system = window.matchMedia('(prefers-color-scheme: light)');
  let choice = 'system';

  const applyTheme = () => {
    const theme = choice === 'system' ? (system.matches ? 'light' : 'dark') : choice;
    if (document.documentElement.dataset.theme === theme) return;
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new Event('vela-theme'));
  };
  system.addEventListener('change', applyTheme);
  let receivedUpdate = false;
  launcher?.onEvent?.((event: { type?: string; theme?: string }) => {
    if (event.type !== 'theme:changed') return;
    receivedUpdate = true;
    choice = event.theme || 'system';
    applyTheme();
  });
  try {
    const cfg = await launcher?.getConfig?.();
    if (!receivedUpdate) choice = cfg?.theme || 'system';
  } catch {
    // Use the system theme when settings are unavailable.
  } finally {
    applyTheme();
  }
}
