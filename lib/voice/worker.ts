// The Whisper worker (ROADMAP-V3 §7, S7). This is the only module that imports
// @huggingface/transformers, so the library (~1.2 MB) and ONNX Runtime stay out
// of every page chunk; lib/voice/transcriber.ts creates the worker on first use.
//
// Everything stays on the device. Model files come from huggingface.co (allowed
// by the CSP's connect-src), the ONNX Runtime binary and its JS glue from our
// own origin (build assets, below), and transformers.js caches all of it in the
// `wrangle-voice` Cache API bucket, so later runs work offline. Audio arrives as
// PCM from the page and is never sent anywhere.
import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressInfo,
} from "@huggingface/transformers";
import { VOICE_CACHE, VOICE_DEVICE, VOICE_DTYPE, VOICE_MODEL } from "./model";

export type VoiceWorkerRequest =
  | { type: "load" }
  | { type: "transcribe"; id: number; audio: Float32Array };

export type VoiceWorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "result"; id: number; text: string; ms: number }
  | { type: "error"; id?: number; message: string };

// ONNX Runtime's wasm binary and glue as Turbopack assets instead of
// transformers.js' default (a jsdelivr CDN the CSP doesn't allow). Given as an
// object, transformers.js fetches and caches both next to the model files.
const ORT_WASM = new URL("onnxruntime-web/ort-wasm-simd-threaded.wasm", import.meta.url).href;
const ORT_MJS = new URL("onnxruntime-web/ort-wasm-simd-threaded.mjs", import.meta.url).href;

env.allowLocalModels = false;
env.cacheKey = VOICE_CACHE;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = { wasm: ORT_WASM, mjs: ORT_MJS };
  // No COOP/COEP headers on the app, so there is no SharedArrayBuffer and ORT runs one thread anyway.
  env.backends.onnx.wasm.numThreads = 1;
}

const post = (message: VoiceWorkerResponse) => self.postMessage(message);

let loading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
const files = new Map<string, { loaded: number; total: number }>();

function onProgress(info: ProgressInfo) {
  if (info.status !== "progress") return;
  files.set(info.file, { loaded: info.loaded, total: info.total });
  let loaded = 0;
  let total = 0;
  for (const f of files.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  post({ type: "progress", loaded, total });
}

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  loading ??= pipeline("automatic-speech-recognition", VOICE_MODEL, {
    dtype: VOICE_DTYPE,
    device: VOICE_DEVICE,
    progress_callback: onProgress,
  })
    .then(async (asr) => {
      await pruneStaleRuntime();
      return asr;
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

/** The asset URLs are content-hashed, so an onnxruntime-web upgrade would otherwise leave a 14 MB orphan in the cache. */
async function pruneStaleRuntime() {
  try {
    // Turbopack may emit the asset URLs path-only; cache keys are absolute.
    const current = new Set([ORT_WASM, ORT_MJS].map((u) => new URL(u, self.location.href).href));
    const cache = await caches.open(VOICE_CACHE);
    for (const request of await cache.keys()) {
      if (request.url.includes("ort-wasm-simd-threaded") && !current.has(request.url)) {
        await cache.delete(request);
      }
    }
  } catch {}
}

self.onmessage = async (event: MessageEvent<VoiceWorkerRequest>) => {
  const msg = event.data;
  try {
    const asr = await load();
    post({ type: "ready" });
    if (msg.type === "load") return;
    const started = performance.now();
    // 30 s windows with a 5 s overlap: Whisper's context is 30 s and notes run up to 2 minutes.
    const out = await asr(msg.audio, { chunk_length_s: 30, stride_length_s: 5 });
    const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim();
    post({ type: "result", id: msg.id, text, ms: Math.round(performance.now() - started) });
  } catch (error) {
    post({
      type: "error",
      id: msg.type === "transcribe" ? msg.id : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
