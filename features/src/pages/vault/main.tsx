import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import '../../screens/vault/vault.css';
import { VaultScreen } from '../../screens/vault/VaultScreen';
import { unwrap } from '../../lib/vault/bridge';

const system = window.matchMedia('(prefers-color-scheme: light)');
let appearance: 'system' | 'light' | 'dark' = 'system';
function applyTheme() {
  document.documentElement.dataset.theme = appearance === 'system' ? system.matches ? 'light' : 'dark' : appearance;
}
applyTheme();
system.addEventListener('change', applyTheme);
let receivedTheme = false;
window.vault.onTheme(theme => { receivedTheme = true; appearance = theme; applyTheme(); });
void unwrap(window.vault.theme()).then(theme => { if (!receivedTheme) { appearance = theme; applyTheme(); } }).catch(() => {});

createRoot(document.getElementById('root')!).render(<VaultScreen />);
