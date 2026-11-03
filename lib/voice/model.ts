// Voice notes (ROADMAP-V3 §7, S7): which Whisper model the worker loads and
// what the page knows about it. Free of heavy imports on purpose: the Dump and
// Settings read these, while `@huggingface/transformers` only ever runs inside
// lib/voice/worker.ts.

export const VOICE_MODEL = "onnx-community/whisper-tiny.en";
/** 8-bit weights: 9.7 MB encoder + 29.3 MB decoder. fp32 is 145 MB, q4 keeps an fp32 embedding table (114 MB). */
export const VOICE_DTYPE = "q8" as const;
/** ONNX Runtime backend. WebGPU is not enabled yet (see docs/context/platform-and-tooling.md, voice notes). */
export const VOICE_DEVICE = "wasm" as const;
/**
 * Cache API bucket transformers.js writes the model files and the ONNX Runtime
 * binary into. Named in public/sw.js too, which keeps it across SW updates.
 */
export const VOICE_CACHE = "wrangle-voice";
/** First-use download: model 39 MB + tokenizer/config 3.2 MB + ONNX Runtime 14.3 MB (measured 2026-11-03). */
export const VOICE_DOWNLOAD_MB = 57;
export const MAX_RECORDING_SECONDS = 120;
/** Fired on window when the model is downloaded or removed. */
export const VOICE_CHANGED_EVENT = "wrangle-voice-changed";

const READY_KEY = "wrangle-voice-ready";
const READY_VALUE = `${VOICE_MODEL}@${VOICE_DTYPE}`;

/** True once this browser has loaded the model end to end; cleared by `removeVoiceModel`. */
export function isVoiceModelReady(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === READY_VALUE;
  } catch {
    return false;
  }
}

export function markVoiceModelReady(): void {
  try {
    localStorage.setItem(READY_KEY, READY_VALUE);
  } catch {}
  window.dispatchEvent(new Event(VOICE_CHANGED_EVENT));
}

/** Bytes in the voice cache (Content-Length, or the body size when missing), or null when there is no cache. */
export async function voiceModelSizeBytes(): Promise<number | null> {
  if (!("caches" in window) || !(await caches.has(VOICE_CACHE))) return null;
  const cache = await caches.open(VOICE_CACHE);
  let total = 0;
  for (const request of await cache.keys()) {
    const res = await cache.match(request);
    if (!res) continue;
    const len = Number(res.headers.get("content-length"));
    total += Number.isFinite(len) && len > 0 ? len : (await res.blob()).size;
  }
  return total;
}

export async function removeVoiceModel(): Promise<void> {
  try {
    localStorage.removeItem(READY_KEY);
  } catch {}
  if ("caches" in window) await caches.delete(VOICE_CACHE);
  window.dispatchEvent(new Event(VOICE_CHANGED_EVENT));
}
