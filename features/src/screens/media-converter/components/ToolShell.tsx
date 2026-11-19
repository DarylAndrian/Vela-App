import type { ReactNode } from 'react';

interface ToolShellProps {
  children: ReactNode;
  settings?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}

export function ToolShell({ children, settings, status, actions }: ToolShellProps) {
  return (
    <div className="mc-tool">
      <main className={settings ? 'mc-body mc-split' : 'mc-body'}>
        <div className="mc-content">{children}</div>
        {settings && (
          <aside className="mc-settings" aria-label="Output settings">
            <h2>Output settings</h2>
            {settings}
          </aside>
        )}
      </main>
      {(status || actions) && (
        <footer className="mc-actionbar">
          <div className="mc-status">{status}</div>
          {actions && <div className="mc-actions">{actions}</div>}
        </footer>
      )}
    </div>
  );
}
