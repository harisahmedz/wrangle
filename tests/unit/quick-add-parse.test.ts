// Pinned so chrono-node's own "today" resolution (which falls back to the
// Node process's local zone for relative words like "tomorrow" — it only
// understands offsets/abbreviations via its own `timezone` option, not
// IANA names) matches this file's UTC-based expectations regardless of the
// host machine's real timezone. Matches Vercel's runtime (TZ=UTC).
process.env.TZ = "UTC";

import { describe, expect, it } from "vitest";
import {
  formatQuickAddDueLabel,
  parseQuickAddTitle,
  type QuickAddProjectOption,
} from "@/lib/kanban/quick-add-parse";

const NOW = new Date("2026-10-27T12:00:00Z");

const PROJECTS: QuickAddProjectOption[] = [
  { id: "p-home", name: "My Space", isPersonal: true },
  { id: "p-side", name: "Side project", isPersonal: false },
  { id: "p-garden", name: "Garden", isPersonal: false },
];

describe("parseQuickAddTitle — dates", () => {
  it("extracts a date+time phrase and strips it from the title (UTC)", () => {
    const result = parseQuickAddTitle("Pay rent tomorrow 5pm", {
      now: NOW,
      tz: "UTC",
      projects: [],
    });
    expect(result.cleanTitle).toBe("Pay rent");
    expect(result.isAllDay).toBe(false);
    expect(result.dueAt?.toISOString()).toBe("2026-10-28T17:00:00.000Z");
    expect(result.dueLabel).toBe("Tomorrow 17:00");
  });

  it("is timezone-aware: an ambiguous hour resolves to a different instant in a non-UTC zone", () => {
    // "at 5" has no am/pm — parseTask's ambiguous-hour heuristic (1-7 ⇒
    // assume afternoon) converts it via `wallTime(tz)`, the one branch that
    // does real IANA-zone math (unlike a certain "5pm", which chrono itself
    // resolves using the process's own local zone, not the `tz` argument).
    const utc = parseQuickAddTitle("call Ali tomorrow at 5", {
      now: NOW,
      tz: "UTC",
      projects: [],
    });
    const auckland = parseQuickAddTitle("call Ali tomorrow at 5", {
      now: NOW,
      tz: "Pacific/Auckland",
      projects: [],
    });
    expect(utc.dueAt?.toISOString()).toBe("2026-10-28T17:00:00.000Z");
    // Pacific/Auckland is UTC+13 in late October (DST) — the same local
    // "5pm" is a different instant: 04:00 UTC, not 17:00 UTC.
    expect(auckland.dueAt?.toISOString()).toBe("2026-10-28T04:00:00.000Z");
    expect(utc.dueAt?.toISOString()).not.toBe(auckland.dueAt?.toISOString());
  });

  it("makes a weekday-only date all-day, with no time in the chip label", () => {
    const result = parseQuickAddTitle("dentist friday", {
      now: NOW,
      tz: "UTC",
      projects: [],
    });
    expect(result.isAllDay).toBe(true);
    expect(result.dueLabel).not.toMatch(/\d{2}:\d{2}/);
  });

  it("has no date chip when no date phrase is present", () => {
    const result = parseQuickAddTitle("Water the plants", {
      now: NOW,
      tz: "UTC",
      projects: [],
    });
    expect(result.dueAt).toBeNull();
    expect(result.dueLabel).toBeNull();
    expect(result.cleanTitle).toBe("Water the plants");
  });
});

describe("parseQuickAddTitle — #project", () => {
  it("matches a project case-insensitively by prefix and strips the token", () => {
    const result = parseQuickAddTitle("Pay rent tomorrow 5pm #side", {
      now: NOW,
      tz: "UTC",
      projects: PROJECTS,
    });
    expect(result.project?.id).toBe("p-side");
    expect(result.projectUnknown).toBe(false);
    expect(result.cleanTitle).toBe("Pay rent");
    expect(result.dueAt?.toISOString()).toBe("2026-10-28T17:00:00.000Z");
  });

  it("matches a project by exact case-insensitive name", () => {
    const result = parseQuickAddTitle("water the plants #GARDEN", {
      now: NOW,
      tz: "UTC",
      projects: PROJECTS,
    });
    expect(result.project?.id).toBe("p-garden");
    expect(result.cleanTitle).toBe("Water the plants");
  });

  it("strips the whole matched project name, not just the first word", () => {
    const result = parseQuickAddTitle("Pay rent tomorrow 5pm #Side project", {
      now: NOW,
      tz: "UTC",
      projects: PROJECTS,
    });
    expect(result.project?.id).toBe("p-side");
    // Previously only "#Side" was stripped, leaving a stray "project" word.
    expect(result.cleanTitle).toBe("Pay rent");
  });

  it("doesn't over-strip when the match is only a word-boundary-unsafe prefix", () => {
    const result = parseQuickAddTitle("Pay rent #Side projectile", {
      now: NOW,
      tz: "UTC",
      projects: PROJECTS,
    });
    expect(result.project?.id).toBe("p-side");
    // "Side project" is a prefix of "Side projectile", but "ile" isn't a
    // word boundary — only the single "#Side" token should be stripped.
    expect(result.cleanTitle).toBe("Pay rent projectile");
  });

  it("keeps the text and flags unknown when no project matches", () => {
    const result = parseQuickAddTitle("Pay rent #nope", {
      now: NOW,
      tz: "UTC",
      projects: PROJECTS,
    });
    expect(result.project).toBeNull();
    expect(result.projectUnknown).toBe(true);
    expect(result.projectToken).toBe("nope");
    expect(result.cleanTitle).toBe("Pay rent #nope");
  });
});

describe("parseQuickAddTitle — removing the date chip strips its text", () => {
  it("re-parsing the date-stripped title finds no date", () => {
    const first = parseQuickAddTitle("Pay rent tomorrow 5pm #side", {
      now: NOW,
      tz: "UTC",
      projects: PROJECTS,
    });
    expect(first.dateStrippedTitle).toBe("Pay rent #side");

    const afterRemoving = parseQuickAddTitle(first.dateStrippedTitle, {
      now: NOW,
      tz: "UTC",
      projects: PROJECTS,
    });
    expect(afterRemoving.dueAt).toBeNull();
    expect(afterRemoving.dueLabel).toBeNull();
    // The #project token survives a date-chip removal.
    expect(afterRemoving.project?.id).toBe("p-side");
    expect(afterRemoving.cleanTitle).toBe("Pay rent");
  });
});

describe("formatQuickAddDueLabel", () => {
  it("appends 24h time for a timed due date", () => {
    const label = formatQuickAddDueLabel(
      new Date("2026-10-28T17:00:00.000Z"),
      false,
      "UTC",
      NOW,
    );
    expect(label).toBe("Tomorrow 17:00");
  });

  it("omits time for an all-day due date", () => {
    const label = formatQuickAddDueLabel(
      new Date("2026-10-28T12:00:00.000Z"),
      true,
      "UTC",
      NOW,
    );
    expect(label).toBe("Tomorrow");
  });
});
