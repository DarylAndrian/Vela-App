import { NativeMediaTool } from './NativeMediaTool';
import { convertVideos, hasLargeVideos } from '../lib/client-video-convert';
import { VIDEO_OUTPUT_FORMATS } from '../lib/video-formats';
import { VIDEO_ACCEPT } from '../lib/media-accept';

export function VideoTool() {
  return (
    <NativeMediaTool
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