import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import { initTheme } from '../../lib/theme';
import { ConnectScreen } from '../../screens/ConnectScreen';

initTheme();
createRoot(document.getElementById('root')!).render(<ConnectScreen />);
