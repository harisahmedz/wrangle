// Page-side client of lib/voice/worker.ts: one worker per page, created on the
// first call and terminated by `disposeVoiceWorker` (the Dump does that on
// close to give a phone its memory back). The type import is erased, so this
// module pulls neither the worker nor transformers.js into the page chunk.
import type { VoiceWorkerRequest, VoiceWorkerResponse } from "./worker";

export type VoiceProgress = { loaded: number; total: number };
/** `progress` while the model downloads, then `null` once it is loaded and the audio is being transcribed. */
export type VoiceStatus = (progress: VoiceProgress | null) => void;

type Transcript = { text: string; ms: number };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (t: Transcript) => void; reject: (e: Error) => void }>();
let loadWaiters: { resolve: () => void; reject: (e: Error) => void }[] = [];
const statusListeners = new Set<VoiceStatus>();

function failAll(error: Error) {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
  for (const w of loadWaiters) w.reject(error);
  loadWaiters = [];
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url));
  worker.onmessage = (event: MessageEvent<VoiceWorkerResponse>) => {
    const msg = event.data;
    switch (msg.type) {
      case "progress":
        for (const fn of statusListeners) fn({ loaded: msg.loaded, total: msg.total });
        return;
      case "ready":
        for (const fn of statusListeners) fn(null);
        for (const w of loadWaiters) w.resolve();
        loadWaiters = [];
        return;
      case "result":
        pending.get(msg.id)?.resolve({ text: msg.text, ms: msg.ms });
        pending.delete(msg.id);
        return;
      case "error": {
        const error = new Error(msg.message);
        if (msg.id === undefined) failAll(error);
        else {
          pending.get(msg.id)?.reject(error);
          pending.delete(msg.id);
        }
      }
    }
  };
  worker.onerror = (event) => {
    failAll(new Error(event.message || "The voice worker stopped."));
  };
  return worker;
}

function send(message: VoiceWorkerRequest, transfer?: Transferable[]) {
  getWorker().postMessage(message, transfer ?? []);
}

/** Downloads (first time) and loads the model. Resolves once the worker reports ready. */
export function loadVoiceModel(onStatus?: VoiceStatus): Promise<void> {
  if (onStatus) statusListeners.add(onStatus);
  return new Promise<void>((resolve, reject) => {
    loadWaiters.push({ resolve, reject });
    send({ type: "load" });
  }).finally(() => {
    if (onStatus) statusListeners.delete(onStatus);
  });
}

/** Transcribes 16 kHz mono PCM; loads the model first when needed (status callbacks as in `loadVoiceModel`). */
export function transcribeAudio(audio: Float32Array, onStatus?: VoiceStatus): Promise<Transcript> {
  if (onStatus) statusListeners.add(onStatus);
  const id = nextId++;
  return new Promise<Transcript>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: "transcribe", id, audio }, [audio.buffer]);
  }).finally(() => {
    if (onStatus) statusListeners.delete(onStatus);
  });
}

/** Terminates the worker; in-flight calls reject with "Cancelled.". */
export function disposeVoiceWorker(): void {
  worker?.terminate();
  worker = null;
  failAll(new Error("Cancelled."));
}
