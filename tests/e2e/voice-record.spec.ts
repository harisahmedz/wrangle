// ROADMAP-V3 S7: the recorder path. Chromium's fake microphone plays the fixture
// clip on a loop; the test records about 9 s, stops, and expects the key words.
// Separate file because launchOptions can only be set at the top level.
import { expect, hasDatabase, test } from "./fixtures/auth";
import { cacheHuggingFace, expectTranscript, openDump, watchUploads, WAV, type Counters } from "./fixtures/voice";

test.use({
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${WAV}`,
    ],
  },
});

test.beforeEach(({ demoSession }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "runs once");
  test.skip(!hasDatabase, "DATABASE_URL not set");
  test.skip(!demoSession.userId, "demo@wrangle.local not seeded");
});

test("a recorded note shows a timer, stops, and is transcribed", async ({ page, context }) => {
  test.setTimeout(600_000);
  const counters: Counters = { bytes: 0, network: 0 };
  await cacheHuggingFace(context, counters);
  const uploads = watchUploads(page);

  const sheet = await openDump(page);
  await sheet.getByRole("button", { name: "Record a voice note" }).click();
  const stop = sheet.getByRole("button", { name: "Stop recording" });
  await expect(stop).toBeVisible();
  await expect(sheet.getByText(/0:0[2-9] \/ 2:00/)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(9_000);
  const started = Date.now();
  await stop.click();
  await expect(sheet.getByText(/Download it once/)).toBeVisible();
  await sheet.getByRole("button", { name: "Download" }).click();
  await expectTranscript(sheet, "record", counters, started);
  expect(uploads).toEqual([]);
});
