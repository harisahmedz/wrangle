// Audio helpers for voice notes. The pure parts (mono mix, resampling, clock,
// container choice) are unit-tested; `decodeToWhisperPcm` is the one browser
// step, turning a recording or an uploaded file into the 16 kHz mono PCM that
// Whisper expects.

export const WHISPER_SAMPLE_RATE = 16000;

/** Averages the channels into a new Float32Array (always a copy, so it can be transferred to the worker). */
export function mixToMono(channels: Float32Array[]): Float32Array {
  const length = channels[0]?.length ?? 0;
  const out = new Float32Array(length);
  if (channels.length === 0) return out;
  const gain = 1 / channels.length;
  for (const channel of channels) {
    for (let i = 0; i < length; i++) out[i] += channel[i] * gain;
  }
  return out;
}

/**
 * Linear interpolation. Good enough for speech on its way to a 16 kHz model,
 * and only a fallback: the browser's decoder resamples first (see below).
 */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(length);
  const last = input.length - 1;
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.min(Math.floor(pos), last);
    const next = Math.min(idx + 1, last);
    const frac = pos - idx;
    out[i] = input[idx] + (input[next] - input[idx]) * frac;
  }
  return out;
}

/** 0 → "0:00", 67 → "1:07". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** The first container this browser can record (Chrome/Firefox: webm/opus, Safari: mp4); undefined lets MediaRecorder choose. */
export function pickRecordingMimeType(isTypeSupported: (type: string) => boolean): string | undefined {
  return RECORDING_TYPES.find((type) => {
    try {
      return isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

/** Decodes any audio the browser can play to 16 kHz mono PCM. Rejects when the container/codec isn't supported. */
export async function decodeToWhisperPcm(blob: Blob): Promise<Float32Array> {
  const bytes = await blob.arrayBuffer();
  let ctx: OfflineAudioContext;
  try {
    // decodeAudioData resamples to the context's rate, so this is the whole conversion in Chrome/Firefox/Safari 14.1+.
    ctx = new OfflineAudioContext(1, 1, WHISPER_SAMPLE_RATE);
  } catch {
    ctx = new OfflineAudioContext(1, 1, 44100);
  }
  const buffer = await ctx.decodeAudioData(bytes);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return resampleLinear(mixToMono(channels), buffer.sampleRate, WHISPER_SAMPLE_RATE);
}
