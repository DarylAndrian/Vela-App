import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import { initTheme } from '../../lib/theme';
import { MacroScreen } from '../../screens/macro/MacroScreen';
import '../../screens/macro/macro.css';

initTheme();
createRoot(document.getElementById('root')!).render(<MacroScreen />);
