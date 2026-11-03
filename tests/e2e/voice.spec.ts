// ROADMAP-V3 S7 "done when": a spoken clip becomes text in the Dump, on the
// device, and keeps working offline once the model is here. Feeds a Windows
// SAPI recording of a known sentence (fixtures/audio/groceries.wav) through the
// upload path and the share target and checks the key words come back. Also
// checks that no request with a body left the device, and that Settings can
// remove the model. The recorder is in voice-record.spec.ts (own browser flags).
//
// Chromium-only and DB-gated like the other signed-in specs. The first two tests
// serve the Whisper files from a disk cache after the first run
// (fixtures/voice.ts); the offline test deliberately doesn't, because routing
// disables Chromium's HTTP cache, which is what carries the worker chunk
// offline in real life. It downloads the ~41 MB from huggingface.co each run.
// Set VOICE_E2E_LOG=1 to print transcripts and timings.
import { expect, hasDatabase, test } from "./fixtures/auth";
import { cacheHuggingFace, expectTranscript, openDump, watchUploads, WAV, type Counters } from "./fixtures/voice";

test.beforeEach(({ demoSession }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "runs once");
  test.skip(!hasDatabase, "DATABASE_URL not set");
  test.skip(!demoSession.userId, "demo@wrangle.local not seeded");
});

test("an uploaded WAV is transcribed on the device into the Dump; Settings can remove the model", async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  const counters: Counters = { bytes: 0, network: 0 };
  await cacheHuggingFace(context, counters);
  const uploads = watchUploads(page);

  const sheet = await openDump(page);
  await sheet.locator('input[type="file"]').setInputFiles(WAV);
  // First use: nothing downloads before the user says so.
  await expect(sheet.getByText(/Download it once/)).toBeVisible();
  expect(counters.bytes).toBe(0);
  const started = Date.now();
  await sheet.getByRole("button", { name: "Download" }).click();
  await expectTranscript(sheet, "upload", counters, started);
  expect(counters.bytes).toBeGreaterThan(30 * 1024 * 1024);
  expect(uploads).toEqual([]);

  // Second clip: cached model, no consent step, appended on a new line.
  await sheet.locator('input[type="file"]').setInputFiles(WAV);
  await expect(sheet.getByText(/Download it once/)).toHaveCount(0);
  await expect(sheet.getByLabel("Brain dump")).toHaveValue(/milk[\s\S]*\n[\s\S]*milk/i, { timeout: 120_000 });

  await page.goto("/settings");
  const panel = page.getByRole("heading", { name: "Voice" }).locator("..");
  await expect(panel.getByText(/Downloaded, \d+ MB on this device/)).toBeVisible();
  await panel.getByRole("button", { name: "Remove voice model" }).click();
  await expect(panel.getByText(/Not downloaded/)).toBeVisible();
  expect(await page.evaluate(() => caches.has("wrangle-voice"))).toBe(false);
  expect(uploads).toEqual([]);
});

test("audio shared into the app goes through the service worker into the Dump", async ({ page, context }) => {
  test.setTimeout(600_000);
  const counters: Counters = { bytes: 0, network: 0 };
  await cacheHuggingFace(context, counters);
  const uploads = watchUploads(page);

  await page.goto("/today");
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // What Chrome's share sheet does for the manifest's share_target: a
  // multipart POST navigation to /share.
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.id = "share";
    form.method = "post";
    form.enctype = "multipart/form-data";
    form.action = "/share";
    const file = document.createElement("input");
    file.type = "file";
    file.name = "audio";
    form.append(file);
    document.body.append(form);
  });
  await page.locator("#share input[type=file]").setInputFiles(WAV);
  const started = Date.now();
  await page.evaluate(() => (document.getElementById("share") as HTMLFormElement).submit());
  await page.waitForURL(/\/today(\?|$)/);

  // Only the service worker's answer stashes the file and opens the Dump with
  // it (app/share/route.ts, the fallback, just redirects), so this is the proof
  // the POST never left the device.
  const sheet = page.getByRole("dialog", { name: "The Dump" });
  await expect(sheet.getByText(/Download it once/)).toBeVisible();
  expect(await page.evaluate(() => caches.has("wrangle-share"))).toBe(true);
  await sheet.getByRole("button", { name: "Download" }).click();
  await expectTranscript(sheet, "share", counters, started);
  // The stash is single-use.
  expect(
    await page.evaluate(async () => (await caches.open("wrangle-share")).match("/__wrangle_shared_audio__")),
  ).toBeFalsy();
  expect(uploads.filter((u) => !u.includes("/share"))).toEqual([]);
});

test("offline: disabled with a hint before the download, working after it", async ({ page, context }) => {
  test.setTimeout(600_000);
  const uploads = watchUploads(page);
  const counters: Counters = { bytes: 0, network: 0 };
  page.on("response", (r) => {
    if (/huggingface\.co|hf\.co/.test(r.url())) counters.bytes += Number(r.headers()["content-length"] ?? 0);
  });

  const sheet = await openDump(page);
  await context.setOffline(true);
  await expect(sheet.getByRole("button", { name: "Record a voice note" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Upload audio" })).toBeDisabled();
  await expect(sheet.getByText(/offline and the voice model isn't downloaded yet/)).toBeVisible();
  await context.setOffline(false);
  await expect(sheet.getByRole("button", { name: "Upload audio" })).toBeEnabled();

  await sheet.locator('input[type="file"]').setInputFiles(WAV);
  await sheet.getByRole("button", { name: "Download" }).click();
  await expectTranscript(sheet, "online, real download", counters, Date.now());
  // Closing the Dump terminates the worker, so the next use loads everything again, from the caches.
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();

  await context.setOffline(true);
  const hf: string[] = [];
  page.on("request", (r) => {
    if (/huggingface\.co|hf\.co/.test(r.url())) hf.push(r.url());
  });
  // Reopen in the same page (the worker chunk comes back from the HTTP cache,
  // the model and ONNX Runtime from the `wrangle-voice` cache).
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("wrangle-dump")));
  await expect(sheet.getByRole("heading", { name: "The Dump" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Upload audio" })).toBeEnabled();
  await sheet.locator('input[type="file"]').setInputFiles(WAV);
  await expect(sheet.getByText(/Download it once/)).toHaveCount(0);
  await expectTranscript(sheet, "offline, from cache", counters, Date.now());
  expect(hf).toEqual([]);
  expect(uploads).toEqual([]);
});
