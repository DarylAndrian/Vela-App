import { createRoot } from 'react-dom/client';
import '../../screens/media-converter/media-converter.css';
import { initTheme } from '../../lib/theme';
import { MediaConverterApp } from '../../screens/media-converter/MediaConverterApp';

initTheme();
createRoot(document.getElementById('root')!).render(<MediaConverterApp />);