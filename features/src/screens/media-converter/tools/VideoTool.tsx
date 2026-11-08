import { NativeMediaTool } from './NativeMediaTool';
import { convertVideos, hasLargeVideos } from '../lib/client-video-convert';
import { VIDEO_OUTPUT_FORMATS } from '../lib/video-formats';
import { VIDEO_ACCEPT } from '../lib/media-accept';

export function VideoTool() {
  return (
    <NativeMediaTool
      eyebrow="Video Converter"
      title="Convert videos to*any popular format*"
      description="Add a single video or a batch, choose your output format, and convert with the built-in local engine. Exports to MP4, MOV, AVI, MKV, and WEBM — instant remuxing when the codecs allow, full re-encode when they don't."
      features={[
        {
          title: 'Single or batch',
          body: 'Convert one video or queue up many. Outputs are saved straight to a folder you choose.',
        },
        {
          title: 'Smart remuxing',
          body: 'MP4, MOV, and MKV are remuxed instantly when codecs fit, with automatic re-encode fallback.',
        },
        {
          title: 'Private by design',
          body: 'Videos never leave your device. Conversion runs entirely on your computer.',
        },
      ]}
      formats={VIDEO_OUTPUT_FORMATS}
      defaultFormat="mp4"
      accept={VIDEO_ACCEPT}
      selectId="video-output-format"
      verb="Convert"
      hasLargeFiles={hasLargeVideos}
      convert={convertVideos}
    />
  );
}