interface ProgressBarProps {
  value?: number | null;
  label?: string;
  className?: string;
}

export function ProgressBar({ value = null, label, className = '' }: ProgressBarProps) {
  const indeterminate = value === null;

  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-mut">{label}</p>
          {!indeterminate && (
            <p className="text-xs font-medium tabular-nums text-mut">
              {Math.round(value)}%
            </p>
          )}
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={label}
        aria-valuenow={indeterminate ? undefined : Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={
            indeterminate
              ? 'h-full w-1/3 animate-[indeterminate-slide_1.2s_ease-in-out_infinite] rounded-full bg-accent motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60'
              : 'h-full rounded-full bg-accent transition-[width] duration-[240ms] ease-out'
          }
          style={indeterminate ? undefined : { width: `${value}%` }}
        />
      </div>
    </div>
  );
}