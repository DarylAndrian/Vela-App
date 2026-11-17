import type { ReactNode } from 'react';

interface Feature {
  title: string;
  body: string;
}

interface ToolShellProps {
  eyebrow: string;
  title: string;
  description: string;
  features?: Feature[];
  children: ReactNode;
  className?: string;
}

function renderTitle(title: string) {
  const parts = title.split('*');
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="text-accent-text">
        {/\s$/.test(parts[index - 1]) ? '' : ' '}
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function ToolShell({
  eyebrow,
  title,
  description,
  features,
  children,
  className = '',
}: ToolShellProps) {
  return (
    <main className={`mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 ${className}`}>
      <header className="mb-6 sm:mb-8">
        <p className="mb-2 text-xs font-medium text-accent-text">{eyebrow}</p>
        <h1 className="text-balance font-display text-2xl font-semibold text-ink">
          {renderTitle(title)}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-5 text-mut">{description}</p>
        )}
      </header>

      {children}

      {features && (
        <section aria-label="Highlights" className="mt-8 grid gap-4 sm:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </section>
      )}
    </main>
  );
}

export function FeatureCard({ title, body }: Feature) {
  return (
    <article className="mc-panel p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-mut">{body}</p>
    </article>
  );
}
