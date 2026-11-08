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
    <nav className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-2.5 sm:px-8">
        <a
          href="#/"
          className="mr-1 flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight text-ink"
        >
          <img
            src={logoUrl}
            alt="Media Converter Logo"
            width={26}
            height={26}
            className="rounded-md"
          />
          <span className="hidden sm:inline">Media Converter</span>
          <span className="font-display italic text-accent sm:hidden">MC</span>
        </a>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_ITEMS.map((item) => {
            const isActive = route === item.href || route.startsWith(`${item.href}/`);

            return (
              <a
                key={item.href}
                href={`#${item.href}`}
                aria-current={isActive ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-accent-soft text-accent'
                    : 'text-mut hover:bg-surface-2 hover:text-ink'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </a>
            );
          })}
        </div>

        <div className="ml-auto shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}