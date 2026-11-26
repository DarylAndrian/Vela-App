import { createRoot } from 'react-dom/client';
import '../../styles/tokens.css';
import { initTheme } from '../../lib/theme';
import { WhiteboardApp } from '../../screens/whiteboard/WhiteboardApp';
import '../../screens/whiteboard/whiteboard.css';

void initTheme();
createRoot(document.getElementById('root')!).render(<WhiteboardApp />);
