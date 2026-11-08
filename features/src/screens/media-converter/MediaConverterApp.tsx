import { useEffect, useState } from 'react';
import { Home } from './Home';
import { AppNav } from './components/AppNav';
import { ConvertTool } from './tools/ConvertTool';
import { CompressTool } from './tools/CompressTool';
import { EditTool } from './tools/EditTool';
import { VideoTool } from './tools/VideoTool';
import { VideoToAudioTool } from './tools/VideoToAudioTool';
import { RemoveBackgroundTool } from './tools/RemoveBackgroundTool';

function useRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const path = hash.replace(/^#/, '');
  return path === '' || path === '/' ? '/' : path;
}

function renderRoute(route: string) {
  if (route === '/convert') return <ConvertTool />;
  if (route === '/compress') return <CompressTool />;
  if (route === '/edit') return <EditTool />;
  if (route === '/video') return <VideoTool />;
  if (route === '/video-to-audio') return <VideoToAudioTool />;
  if (route === '/remove-background') return <RemoveBackgroundTool />;
  return <Home />;
}

export function MediaConverterApp() {
  const route = useRoute();

  return (
    <div className="min-h-screen bg-bg text-ink">
      <AppNav route={route} />
      {renderRoute(route)}
    </div>
  );
}