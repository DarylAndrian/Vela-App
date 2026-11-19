import { NativeMediaTool } from './NativeMediaTool';
import { convertVideosToAudio, hasLargeVideos } from '../lib/client-audio-convert';
import { AUDIO_OUTPUT_FORMATS } from '../lib/audio-formats';
import { AUDIO_INPUT_ACCEPT } from '../lib/media-accept';

export function VideoToAudioTool() {
  return (
    <NativeMediaTool
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