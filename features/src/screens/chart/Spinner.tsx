export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`spinner ${className}`.trim()}
      viewBox="0 0 24 24"
      style={{ width: size, height: size, flex: 'none' }}
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2.5" opacity=".2" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}