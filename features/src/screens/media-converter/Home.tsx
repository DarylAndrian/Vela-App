import {
  ArrowUpRightIcon,
  AudioIcon,
  CompressIcon,
  EditIcon,
  EraserIcon,
  ImageIcon,
  VideoIcon,
} from './icons';

const TOOLS = [
  {
    href: '#/convert',
    label: 'Image Converter',
    description: 'Convert JPG, PNG, WebP, GIF, BMP, TIFF, and HEIC. Single file or batch to ZIP.',
    icon: ImageIcon,
  },
  {
    href: '#/compress',
    label: 'Compress',
    description: 'Shrink images to a target size with an iterative quality and resize loop.',
    icon: CompressIcon,
  },
  {
    href: '#/video',
    label: 'Video Converter',
    description: 'Convert MP4, MOV, AVI, MKV, and WEBM with ffmpeg running on your computer.',
    icon: VideoIcon,
  },
  {
    href: '#/video-to-audio',
    label: 'Video to Audio',
    description: 'Extract audio from videos as MP3, WAV, M4A, OGG, FLAC, or OPUS.',
    icon: AudioIcon,
  },
  {
    href: '#/remove-background',
    label: 'Background Remover',
    description: 'AI-powered subject cutout with fast and high-quality edge refinement.',
    icon: EraserIcon,
  },
  {
    href: '#/edit',
    label: 'Image Editor',
    description: 'Annotate photos with pixelate, shapes, text, and brush tools.',
    icon: EditIcon,
  },
] as const;

export function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 sm:mb-10">
        <p className="mb-2 text-xs font-medium text-accent-text">Media Converter</p>
        <h1 className="max-w-3xl text-balance font-display text-[32px] leading-10 font-bold text-ink">
          Convert, compress, and <span className="text-accent-text">clean up</span> media — right on
          your computer
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-6 text-mut">
          Six lightweight tools for images and video. Files are processed locally
          with no uploads, no accounts, and no size limits — except your
          computer&apos;s memory.
        </p>
      </header>

      <section aria-label="Tools" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {TOOLS.map((tool) => (
          <a key={tool.href} href={tool.href} className="mc-product group flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                <tool.icon aria-hidden className="h-6 w-6" />
              </div>
              <ArrowUpRightIcon
                aria-hidden
                className="h-5 w-5 text-mut transition-colors duration-[180ms] group-hover:text-accent-text"
              />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">{tool.label}</h2>
              <p className="mt-1 text-sm leading-5 text-mut">{tool.description}</p>
            </div>
          </a>
        ))}
      </section>

      <p className="mt-8 flex items-center gap-2 text-xs font-medium text-mut">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
        All processing runs locally — your files never leave this device.
      </p>
    </main>
  );
}