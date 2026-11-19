import { useState } from 'react';
import { vela } from '../lib/ipc';

export function RevealOutput({ path }: { path: string }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);

  async function reveal() {
    try {
      const result = await vela().files.reveal(path);
      setFailedPath(result.ok ? null : path);
    } catch {
      setFailedPath(path);
    }
  }

  return (
    <span>
      <button className="reveal-output" type="button" onClick={reveal}>Show in File Explorer</button>
      {failedPath === path && <span role="status"> Couldn’t open this location.</span>}
    </span>
  );
}
