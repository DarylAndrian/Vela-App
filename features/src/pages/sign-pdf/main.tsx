import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import { initTheme } from '../../lib/theme';
import { SignPdfApp } from '../../screens/sign-pdf/SignPdfApp';
import '../../screens/sign-pdf/sign-pdf.css';

initTheme();
createRoot(document.getElementById('root')!).render(<SignPdfApp />);
