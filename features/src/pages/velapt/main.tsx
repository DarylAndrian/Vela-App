import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import { initTheme } from '../../lib/theme';
import { VelaPtpApp } from '../../screens/VelaPtpApp';

initTheme();
createRoot(document.getElementById('root')!).render(<VelaPtpApp />);
