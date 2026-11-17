import type { ButtonHTMLAttributes } from 'react';
import { SpinnerIcon } from '../icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-strong',
  secondary:
    'border border-line-strong bg-surface text-ink hover:bg-hover',
  ghost:
    'text-mut hover:bg-hover hover:text-ink',
  danger:
    'bg-danger text-on-danger hover:bg-danger-hover active:bg-danger-pressed',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'min-h-8 px-3 gap-1.5',
  md: 'min-h-10 px-4 gap-2',
  lg: 'min-h-12 px-5 gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors duration-[120ms] select-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-disabled-fg ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className ?? ''}`}
      {...props}
    >
      {loading && <SpinnerIcon className="h-4 w-4" />}
      {children}
    </button>
  );
}
