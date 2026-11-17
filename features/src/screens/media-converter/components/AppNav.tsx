import {
  AudioIcon,
  CompressIcon,
  EditIcon,
  EraserIcon,
  ImageIcon,
  VideoIcon,
} from '../icons';
import { ThemeToggle } from './ThemeToggle';
import logoUrl from '../logo.webp';

const NAV_ITEMS = [
  { href: '/convert', label: 'Image', icon: ImageIcon },
  { href: '/compress', label: 'Compress', icon: CompressIcon },
  { href: '/video', label: 'Video', icon: VideoIcon },
  { href: '/video-to-audio', label: 'Audio', icon: AudioIcon },
  { href: '/remove-background', label: 'BG Remover', icon: EraserIcon },
  { href: '/edit', label: 'Edit', icon: EditIcon },
] as const;

export function AppNav({ route }: { route: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2 sm:px-6">
        <a
          href="#/"
          className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg pr-1 font-display text-base font-semibold text-ink"
        >
          <img src={logoUrl} alt="" width={28} height={28} className="rounded-lg" />
          <span className="hidden md:inline">Media Converter</span>
          <span className="sr-only md:hidden">Media Converter home</span>
        </a>

        <nav aria-label="Tools" className="min-w-0 flex-1">
          <ul className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.map((item) => {
              const isActive = route === item.href || route.startsWith(`${item.href}/`);
              return (
                <li key={item.href} className="shrink-0">
                  <a
                    href={`#${item.href}`}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.label}
                    className={`relative inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors duration-[120ms] ${
                      isActive
                        ? 'bg-accent-soft text-accent-text'
                        : 'text-mut hover:bg-hover hover:text-ink'
                    }`}
                  >
                    <item.icon aria-hidden className="h-4 w-4" />
                    <span className="sr-only lg:not-sr-only">{item.label}</span>
                    {isActive && (
                      <span aria-hidden className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-accent" />
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
