import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import { initTheme } from '../../lib/theme';
import { PictureConnectorScreen } from '../../screens/PictureConnectorScreen';

initTheme();
createRoot(document.getElementById('root')!).render(<PictureConnectorScreen />);
