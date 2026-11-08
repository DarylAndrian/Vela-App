import { NativeMediaTool } from './NativeMediaTool';
import { convertVideosToAudio, hasLargeVideos } from '../lib/client-audio-convert';
import { AUDIO_OUTPUT_FORMATS } from '../lib/audio-formats';
import { AUDIO_INPUT_ACCEPT } from '../lib/media-accept';

export function VideoToAudioTool() {
  return (
    <NativeMediaTool
      eyebrow="Video to Audio"
      title="Extract audio from*any video*"
      description="Add a single video or a batch, choose your output audio format, and extract instantly. Exports to MP3, WAV, M4A, OGG, FLAC, and OPUS. All processing happens on your computer."
      features={[
        {
          title: 'Single or batch',
          body: 'Extract audio from one video or queue up many. Outputs are saved straight to a folder you choose.',
        },
        {
          title: 'Six audio formats',
          body: 'Export to MP3, WAV, M4A, OGG, FLAC, or OPUS at 192 kbps for lossy formats.',
        },
        {
          title: 'Private by design',
          body: 'Videos never leave your device. Extraction runs entirely on your computer.',
        },
      ]}
      formats={AUDIO_OUTPUT_FORMATS}
      defaultFormat="mp3"
      accept={AUDIO_INPUT_ACCEPT}
      selectId="audio-output-format"
      verb="Extract"
      hasLargeFiles={hasLargeVideos}
      convert={convertVideosToAudio}
    />
  );
}