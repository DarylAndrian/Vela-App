import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import { initTheme } from '../../lib/theme';
import { ChartCodeApp } from '../../screens/ChartCodeApp';

initTheme();
createRoot(document.getElementById('root')!).render(<ChartCodeApp />);
