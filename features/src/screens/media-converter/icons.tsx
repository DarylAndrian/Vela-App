import type { LucideProps } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';

export {
  ArrowUpRight as ArrowUpRightIcon,
  AudioLines as AudioIcon,
  Check as CheckIcon,
  CircleAlert as ErrorIcon,
  Eraser as EraserIcon,
  File as FileIcon,
  Image as ImageIcon,
  Info as InfoIcon,
  Minimize2 as CompressIcon,
  Moon as MoonIcon,
  SquarePen as EditIcon,
  Sun as SunIcon,
  TriangleAlert as WarningIcon,
  Upload as UploadIcon,
  Video as VideoIcon,
  X as CloseIcon,
} from 'lucide-react';

export function SpinnerIcon({ className = '', ...props }: LucideProps) {
  return <LoaderCircle aria-hidden className={`animate-spin ${className}`} {...props} />;
}
