import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import { initTheme } from '../../lib/theme';
import { TaiwanYearScreen } from '../../screens/TaiwanYearScreen';

initTheme();
createRoot(document.getElementById('root')!).render(<TaiwanYearScreen />);
