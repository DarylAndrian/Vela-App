import { useEffect } from 'react';
import { getMedia, hasMedia } from './media-bridge';

export function useMediaActivity(mode: 'convert' | 'compress' | 'background', busy: boolean) {
  useEffect(() => {
    if (!busy || !hasMedia()) return;
    const media = getMedia();
    media.reportActivity(mode, true);
    return () => media.reportActivity(mode, false);
  }, [mode, busy]);
}
