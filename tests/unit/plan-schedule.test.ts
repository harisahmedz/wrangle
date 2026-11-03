import { describe, expect, it } from "vitest";
import {
  capForDay,
  DEFAULT_DAILY_CAP,
  DEFAULT_WEEKEND_CAP,
  duePatchFor,
  isChange,
  isWeekend,
  MAX_PLAN_CANDIDATES,
  PLAN_HORIZON_DAYS,
  planDays,
  rankCandidates,
  scheduleWeek,
  type PlanCandidate,
  type PlanMove,
} from "@/lib/plan/schedule";
import { PLAN_CAP_DEFAULTS } from "@/lib/validation/prefs";

// ROADMAP-V3 §6 / S6: the deterministic scheduler. Today is Tuesday
// 2026-11-03; the week is Tue 03 … Mon 09 with Sat 07 / Sun 08 the weekend.
const TODAY = "2026-11-03";
const UTC = "UTC";
const LA = "America/Los_Angeles";

let seq = 0;
function card(
  id: string,
  o: { due?: string | null; allDay?: boolean; priority?: 1 | 2 | 3 | null; created?: string } = {},
): PlanCandidate {
  seq++;
  return {
    id,
    dueAt: o.due ?? null,
    isAllDay: o.allDay ?? false,
    priority: o.priority ?? null,
    // Monotonic: each card made later than the one before, unless `created` says otherwise.
    createdAt: o.created ?? new Date(Date.UTC(2026, 9, 1) + seq * 60_000).toISOString(),
  };
}
/** n all-day cards due on `day` (UTC noon), ids `${prefix}1..n`. */
function dueOn(day: string, n: number, prefix = day.slice(-2), priority: 1 | 2 | 3 | null = null) {
  return Array.from({ length: n }, (_, i) =>
    card(`${prefix}-${i + 1}`, { due: `${day}T12:00:00.000Z`, allDay: true, priority }),
  );
}
const run = (cands: PlanCandidate[], extra: Partial<Parameters<typeof scheduleWeek>[1]> = {}) =>
  scheduleWeek(cands, { todayKey: TODAY, timeZone: UTC, ...extra });
const byId = (moves: PlanMove[]) => Object.fromEntries(moves.map((m) => [m.cardId, m.to]));
const onDay = (moves: PlanMove[], day: string) => moves.filter((m) => m.to === day).map((m) => m.cardId);

describe("calendar helpers", () => {
  it("planDays is 7 days from today; isWeekend/capForDay pick out Sat and Sun", () => {
    expect(PLAN_HORIZON_DAYS).toBe(7);
    expect(planDays(TODAY)).toEqual([
      "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09",
    ]);
    expect(isWeekend("2026-11-07")).toBe(true);
    expect(isWeekend("2026-11-08")).toBe(true);
    expect(isWeekend("2026-11-09")).toBe(false);
    expect(capForDay("2026-11-07", 5, 2)).toBe(2);
    expect(capForDay("2026-11-04", 5, 2)).toBe(5);
    expect(capForDay("2026-11-04", -3, 2)).toBe(0);
  });

  it("the scheduler defaults equal the Settings defaults", () => {
    expect(DEFAULT_DAILY_CAP).toBe(PLAN_CAP_DEFAULTS.dailyCap);
    expect(DEFAULT_WEEKEND_CAP).toBe(PLAN_CAP_DEFAULTS.weekendCap);
  });
});

describe("scheduleWeek: basics", () => {
  it("empty input → empty plan", () => {
    expect(run([])).toEqual([]);
  });

  it("cards due this week keep their day under the cap, and the plan is in day order", () => {
    const plan = run([
      card("thu", { due: "2026-11-05T09:00:00.000Z" }),
      card("tue", { due: "2026-11-03T18:00:00.000Z" }),
      card("mon", { due: "2026-11-09T12:00:00.000Z", allDay: true }),
    ]);
    expect(plan.map((m) => [m.cardId, m.to])).toEqual([
      ["tue", "2026-11-03"],
      ["thu", "2026-11-05"],
      ["mon", "2026-11-09"],
    ]);
    expect(plan.every((m) => !isChange(m, UTC))).toBe(true);
  });

  it("dated cards beyond the horizon are not part of the plan", () => {
    const plan = run([card("later", { due: "2026-11-10T09:00:00.000Z" }), card("today", { due: "2026-11-03T09:00:00.000Z" })]);
    expect(plan.map((m) => m.cardId)).toEqual(["today"]);
  });

  it("keepTime is true only for timed cards; all-day and undated moves are not timed", () => {
    const plan = run([
      card("timed", { due: "2026-11-01T09:30:00.000Z" }),
      card("allday", { due: "2026-11-01T12:00:00.000Z", allDay: true }),
      card("undated"),
    ]);
    const by = Object.fromEntries(plan.map((m) => [m.cardId, m]));
    expect(by.timed).toMatchObject({ from: "2026-11-01T09:30:00.000Z", to: TODAY, keepTime: true });
    expect(by.allday).toMatchObject({ to: TODAY, keepTime: false });
    expect(by.undated).toMatchObject({ from: null, to: TODAY, keepTime: false });
    expect(plan.every((m) => isChange(m, UTC))).toBe(true);
  });
});

describe("scheduleWeek: caps and spill", () => {
  it("over the daily cap, the lowest-ranked cards move to the next day with room, never earlier", () => {
    const wed = [
      ...dueOn("2026-11-04", 3, "p3", 3),
      ...dueOn("2026-11-04", 2, "p1", 1),
      ...dueOn("2026-11-04", 2, "p4", null),
    ];
    const plan = run(wed);
    expect(onDay(plan, "2026-11-04").sort()).toEqual(["p1-1", "p1-2", "p3-1", "p3-2", "p3-3"]);
    expect(onDay(plan, "2026-11-05").sort()).toEqual(["p4-1", "p4-2"]);
    expect(onDay(plan, "2026-11-03")).toEqual([]);
  });

  it("a day's own due cards take precedence over spill from an earlier day", () => {
    const plan = run([...dueOn("2026-11-04", 6, "wed"), ...dueOn("2026-11-05", 5, "thu")]);
    expect(onDay(plan, "2026-11-04")).toHaveLength(5);
    expect(onDay(plan, "2026-11-05").sort()).toEqual(["thu-1", "thu-2", "thu-3", "thu-4", "thu-5"]);
    expect(onDay(plan, "2026-11-06")).toEqual(["wed-6"]);
  });

  it("with no room anywhere later in the week, a due card stays on its day over the cap", () => {
    const plan = run(dueOn("2026-11-09", 7, "mon"));
    expect(onDay(plan, "2026-11-09")).toHaveLength(7);
    expect(plan.every((m) => !isChange(m, UTC))).toBe(true);
  });

  it("weekend days use the weekend cap; cap 0 skips them entirely", () => {
    const sat = dueOn("2026-11-07", 4, "sat");
    const plan = run(sat);
    expect(onDay(plan, "2026-11-07")).toHaveLength(2);
    expect(onDay(plan, "2026-11-08")).toHaveLength(2);

    const strict = run([...sat, card("undated-1"), card("undated-2")], { weekendCap: 0 });
    expect(onDay(strict, "2026-11-07")).toEqual([]);
    expect(onDay(strict, "2026-11-08")).toEqual([]);
    expect(onDay(strict, "2026-11-09").sort()).toEqual(["sat-1", "sat-2", "sat-3", "sat-4"]);
    expect(onDay(strict, "2026-11-03").sort()).toEqual(["undated-1", "undated-2"]);
  });

  it("a custom daily cap applies", () => {
    const plan = run(dueOn("2026-11-03", 4, "tue"), { dailyCap: 2 });
    expect(onDay(plan, "2026-11-03")).toHaveLength(2);
    expect(onDay(plan, "2026-11-04")).toHaveLength(2);
  });
});

describe("scheduleWeek: overdue and undated fill", () => {
  it("fills from today onward in rank order: P1→P4, overdue before undated, then oldest", () => {
    const plan = run(
      [
        card("u-p4-old", { created: "2026-01-01T00:00:00.000Z" }),
        card("u-p4-new", { created: "2026-06-01T00:00:00.000Z" }),
        card("o-p4", { due: "2026-10-20T12:00:00.000Z", allDay: true }),
        card("u-p1", { priority: 1 }),
        card("o-p2-older", { due: "2026-10-01T09:00:00.000Z", priority: 2 }),
        card("o-p2-newer", { due: "2026-10-15T09:00:00.000Z", priority: 2 }),
        card("u-p2", { priority: 2 }),
      ],
      { dailyCap: 2, weekendCap: 2 },
    );
    expect(plan.map((m) => m.cardId)).toEqual([
      "u-p1", "o-p2-older", // today
      "o-p2-newer", "u-p2", // Wed
      "o-p4", "u-p4-old", // Thu
      "u-p4-new", // Fri
    ]);
    expect(byId(plan)).toMatchObject({ "u-p1": "2026-11-03", "u-p4-new": "2026-11-06" });
  });

  it("fillers only take the room left after this week's due cards", () => {
    const plan = run([...dueOn("2026-11-03", 4, "tue"), card("u-1"), card("u-2")]);
    expect(onDay(plan, "2026-11-03")).toHaveLength(5);
    expect(onDay(plan, "2026-11-03")).toContain("u-1");
    expect(onDay(plan, "2026-11-04")).toEqual(["u-2"]);
  });

  it("what doesn't fit this week is left out of the plan", () => {
    const cands = Array.from({ length: 10 }, (_, i) => card(`u-${i + 1}`));
    const plan = run(cands, { dailyCap: 1, weekendCap: 0 });
    expect(plan).toHaveLength(5); // Tue, Wed, Thu, Fri, Mon
    expect(plan.map((m) => m.cardId)).toEqual(["u-1", "u-2", "u-3", "u-4", "u-5"]);
  });
});

describe("scheduleWeek: pinned (AI picks)", () => {
  it("pinned fillers go first, ahead of higher-priority unpinned ones", () => {
    const plan = run(
      [card("p1-overdue", { due: "2026-10-30T09:00:00.000Z", priority: 1 }), card("p4-undated"), card("p3-undated", { priority: 3 })],
      { dailyCap: 1, weekendCap: 0, pinned: ["p4-undated"] },
    );
    expect(plan.map((m) => [m.cardId, m.to])).toEqual([
      ["p4-undated", "2026-11-03"],
      ["p1-overdue", "2026-11-04"],
      ["p3-undated", "2026-11-05"],
    ]);
  });

  it("on an over-cap day, pinned due cards keep their day and the others spill", () => {
    const plan = run([...dueOn("2026-11-04", 2, "p1", 1), card("pinned", { due: "2026-11-04T12:00:00.000Z", allDay: true })], {
      dailyCap: 1,
      pinned: ["pinned"],
    });
    expect(onDay(plan, "2026-11-04")).toEqual(["pinned"]);
    expect(onDay(plan, "2026-11-05")).toEqual(["p1-1"]);
    expect(onDay(plan, "2026-11-06")).toEqual(["p1-2"]);
  });

  it("unknown pinned ids are ignored; pinning never adds cards", () => {
    const plan = run([card("a"), card("b")], { pinned: ["nope", "b"] });
    expect(plan.map((m) => m.cardId)).toEqual(["b", "a"]);
  });
});

describe("scheduleWeek: timezone day boundaries", () => {
  it("buckets instants by the user's local day, not UTC", () => {
    // 03:00Z on Nov 4 is still Nov 3 (today) in Los Angeles; 02:00Z on Nov 3 is Nov 2 (overdue) there.
    const cands = [card("late-tonight", { due: "2026-11-04T03:00:00.000Z" }), card("last-night", { due: "2026-11-03T02:00:00.000Z" })];
    const la = scheduleWeek(cands, { todayKey: TODAY, timeZone: LA });
    expect(byId(la)).toEqual({ "late-tonight": "2026-11-03", "last-night": "2026-11-03" });
    expect(la.find((m) => m.cardId === "late-tonight")!.keepTime).toBe(true);
    expect(isChange(la.find((m) => m.cardId === "late-tonight")!, LA)).toBe(false);
    expect(isChange(la.find((m) => m.cardId === "last-night")!, LA)).toBe(true);

    const utc = run(cands);
    expect(byId(utc)).toEqual({ "late-tonight": "2026-11-04", "last-night": "2026-11-03" });
    expect(isChange(utc.find((m) => m.cardId === "last-night")!, UTC)).toBe(false);
  });

  it("a card that is next week in Tokyo but this week in UTC follows the timezone given", () => {
    const c = [card("edge", { due: "2026-11-09T16:00:00.000Z" })];
    expect(scheduleWeek(c, { todayKey: TODAY, timeZone: "Asia/Tokyo" })).toEqual([]);
    expect(byId(run(c))).toEqual({ edge: "2026-11-09" });
  });
});

describe("duePatchFor", () => {
  it("a timed card keeps its wall-clock time across a DST change", () => {
    // Oct 30 2026 14:30 PDT (UTC-7) → Nov 5 2026 14:30 PST (UTC-8).
    const move: PlanMove = { cardId: "t", from: "2026-10-30T21:30:00.000Z", to: "2026-11-05", keepTime: true };
    expect(duePatchFor(move, LA)).toEqual({ dueAt: "2026-11-05T22:30:00.000Z" });
  });

  it("an all-day card lands at local noon and stays all-day (isAllDay untouched)", () => {
    const move: PlanMove = { cardId: "a", from: "2026-10-30T19:00:00.000Z", to: "2026-11-05", keepTime: false };
    expect(duePatchFor(move, LA)).toEqual({ dueAt: "2026-11-05T20:00:00.000Z" });
  });

  it("an undated card becomes an all-day card at local noon", () => {
    const move: PlanMove = { cardId: "u", from: null, to: "2026-11-03", keepTime: false };
    expect(duePatchFor(move, "Asia/Tokyo")).toEqual({ dueAt: "2026-11-03T03:00:00.000Z", isAllDay: true });
    expect(duePatchFor(move, UTC)).toEqual({ dueAt: "2026-11-03T12:00:00.000Z", isAllDay: true });
  });
});

describe("ranking, the 40 cap and determinism", () => {
  it("rankCandidates: priority, then overdue first, then oldest, then id", () => {
    const ranked = rankCandidates(
      [
        card("b-p4-undated", { created: "2026-02-01T00:00:00.000Z" }),
        card("a-p4-undated", { created: "2026-02-01T00:00:00.000Z" }),
        card("p4-overdue", { due: "2026-10-01T00:00:00.000Z" }),
        card("p1-thisweek", { due: "2026-11-05T00:00:00.000Z", priority: 1 }),
        card("p2-undated", { priority: 2 }),
        card("p1-overdue", { due: "2026-11-01T00:00:00.000Z", priority: 1 }),
      ],
      TODAY,
      UTC,
    ).map((c) => c.id);
    expect(ranked).toEqual(["p1-overdue", "p1-thisweek", "p2-undated", "p4-overdue", "a-p4-undated", "b-p4-undated"]);
  });

  it("more than 40 candidates: only the 40 best-ranked are considered", () => {
    expect(MAX_PLAN_CANDIDATES).toBe(40);
    const many = Array.from({ length: 45 }, (_, i) =>
      card(`u-${String(i + 1).padStart(2, "0")}`, { created: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const plan = run([...many, card("p1", { due: "2026-11-04T09:00:00.000Z", priority: 1 })], { dailyCap: 20, weekendCap: 20 });
    expect(plan).toHaveLength(40);
    expect(plan.map((m) => m.cardId)).toContain("p1");
    // The 5 newest undated cards (created on the 28th / 27th … ) are the ones cut.
    const ids = new Set(plan.map((m) => m.cardId));
    expect(ids.has("u-28")).toBe(false); // created Jan 28
    expect(ids.has("u-01")).toBe(true); // created Jan 1
  });

  it("is deterministic: the input order never changes the plan", () => {
    const cands = [
      ...dueOn("2026-11-04", 7, "wed"),
      ...dueOn("2026-11-07", 3, "sat", 2),
      card("o1", { due: "2026-10-20T10:00:00.000Z", priority: 1 }),
      card("o2", { due: "2026-10-21T10:00:00.000Z" }),
      card("u1"),
      card("u2", { priority: 3 }),
    ];
    const a = run(cands, { pinned: ["u1"] });
    const b = run([...cands].reverse(), { pinned: ["u1"] });
    const c = run([...cands].sort((x, y) => (x.id < y.id ? 1 : -1)), { pinned: ["u1"] });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(run(cands, { pinned: ["u1"] })).toEqual(a);
  });
});
