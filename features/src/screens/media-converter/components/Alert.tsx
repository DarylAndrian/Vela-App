import type { ReactNode } from 'react';
import { CheckIcon, ErrorIcon, InfoIcon, WarningIcon } from '../icons';

type Tone = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}

const TONE_CLASSES: Record<Tone, string> = {
  info: 'bg-info-bg text-info-fg',
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  error: 'bg-danger-bg text-danger-fg',
};

const TONE_ICON: Record<Tone, typeof InfoIcon> = {
  info: InfoIcon,
  success: CheckIcon,
  warning: WarningIcon,
  error: ErrorIcon,
};

export function Alert({ tone = 'info', title, children }: AlertProps) {
  const Icon = TONE_ICON[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm leading-5 ${TONE_CLASSES[tone]}`}
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">
        {title && <p className="font-semibold">{title}</p>}
        <p>{children}</p>
      </div>
    </div>
  );
}
