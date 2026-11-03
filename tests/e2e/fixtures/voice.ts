// Shared pieces of the voice-note specs (voice.spec.ts, voice-record.spec.ts):
// the fixture clip, a disk cache for the Whisper files and the transcript check.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

/** Windows SAPI reading "Buy milk and eggs tomorrow morning. Call the dentist on Friday. Spent twelve dollars on coffee." (16 kHz mono, 7.6 s). */
export const WAV = fileURLToPath(new URL("./audio/groceries.wav", import.meta.url));
export const KEY_WORDS = ["milk", "dentist", "coffee"];
export const MODEL_TIMEOUT = 540_000;

const MODEL_CACHE_DIR = join(process.cwd(), "node_modules", ".cache", "wrangle-voice-e2e");

export type Counters = { bytes: number; network: number };

/**
 * Serves the Hugging Face files from node_modules/.cache after the first run, so
 * the ~45 MB download happens once per machine. The worker's requests go
 * through context.route in Chromium.
 */
export async function cacheHuggingFace(context: BrowserContext, counters: Counters) {
  await context.route(/^https:\/\/(huggingface\.co|[^/]+\.hf\.co|[^/]+\.huggingface\.co)\//, async (route) => {
    // transformers.js first asks for 1 byte of each file (a Range probe for its size); let those through.
    if (route.request().headers()["range"]) return route.continue();
    const file = join(MODEL_CACHE_DIR, createHash("sha1").update(route.request().url()).digest("hex"));
    if (existsSync(file)) {
      const body = readFileSync(file);
      counters.bytes += body.length;
      await route.fulfill({ status: 200, body, headers: { "access-control-allow-origin": "*" } });
      return;
    }
    const response = await route.fetch();
    const body = await response.body();
    counters.bytes += body.length;
    counters.network += body.length;
    if (response.status() === 200) {
      mkdirSync(MODEL_CACHE_DIR, { recursive: true });
      writeFileSync(file, body);
    }
    await route.fulfill({ response, body });
  });
}

/** Requests that carry a body: the audio must never be one of them. */
export function watchUploads(page: Page) {
  const uploads: string[] = [];
  page.on("request", (req) => {
    const size = req.postDataBuffer()?.length ?? 0;
    if (size > 10_000) uploads.push(`${req.method()} ${req.url()} (${size} B)`);
  });
  return uploads;
}

/** `/today?dump=1` opens the Dump once the page has hydrated (components/pwa/triggers.tsx). */
export async function openDump(page: Page) {
  await page.goto("/today?dump=1");
  const sheet = page.getByRole("dialog", { name: "The Dump" });
  await expect(sheet.getByRole("heading", { name: "The Dump" })).toBeVisible();
  return sheet;
}

/** Waits for the transcript, checks the key words, and logs timings with VOICE_E2E_LOG=1. */
export async function expectTranscript(sheet: Locator, label: string, counters: Counters, started: number) {
  const textarea = sheet.getByLabel("Brain dump");
  await expect(textarea).toHaveValue(new RegExp(KEY_WORDS[0], "i"), { timeout: MODEL_TIMEOUT });
  const total = Date.now() - started;
  const text = (await textarea.inputValue()).toLowerCase();
  for (const word of KEY_WORDS) expect(text).toContain(word);
  const status = sheet.locator("[data-voice-ms]");
  await expect(status).toBeVisible();
  const ms = Number(await status.getAttribute("data-voice-ms"));
  expect(ms).toBeGreaterThan(0);
  if (process.env.VOICE_E2E_LOG) {
    console.log(
      `voice e2e (${label}): "${text}" | transcription ${ms} ms | consent→text ${total} ms | model bytes ${counters.bytes} (${counters.network} from huggingface.co)`,
    );
  }
}
