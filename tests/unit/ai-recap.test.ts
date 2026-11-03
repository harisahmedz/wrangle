import { describe, expect, it } from "vitest";
import { runTaskWith } from "@/lib/ai/run-task";
import { checkRecapLine, hashFacts, numbersIn, recapTask } from "@/lib/ai/tasks/recap";
import { monthRecapFacts, weekRecapFacts } from "@/lib/review/recap-facts";
import type { Candidate } from "@/lib/ai/types";
import type { WeekReview } from "@/lib/weekly/stats";
import type { WrappedStats } from "@/lib/wrapped/types";

const FACTS = ["cards closed: 8", "top project: Side project", "learning: 2h 15m", "spent: $132.40", "slipped: 4"];

const fake = (reply: string): Candidate => ({
  provider: "openrouter",
  model: "fake",
  complete: async () => reply,
});
const run = (reply: string, facts = FACTS) =>
  runTaskWith(recapTask, { period: "week", facts }, { mode: "on-device-then-openrouter", online: true, candidates: [fake(reply)] });
const json = (line: string) => JSON.stringify({ line });

describe("numbersIn", () => {
  it("reads digits, currency, times and thousands", () => {
    expect(numbersIn("$1,320.50 in 2h 15m, 08 cards")).toEqual(["1320.5", "2", "15", "8"]);
    expect(numbersIn("no digits")).toEqual([]);
  });
});

describe("checkRecapLine", () => {
  it("accepts a calm second-person sentence using only fact numbers", () => {
    const l = "You closed 8 cards, studied for 2h 15m and spent $132.40.";
    expect(checkRecapLine(l, FACTS)).toBe(l);
    expect(checkRecapLine("  Your week had 4 slips and 8 closed cards.  ", FACTS)).toBe("Your week had 4 slips and 8 closed cards.");
    expect(checkRecapLine("You stayed steady and shipped without drama", FACTS)).not.toBeNull();
  });
  it("rejects an invented number, currency or time", () => {
    expect(checkRecapLine("You closed 9 cards.", FACTS)).toBeNull();
    expect(checkRecapLine("You spent $132.", FACTS)).toBeNull();
    expect(checkRecapLine("You studied for 2h 30m.", FACTS)).toBeNull();
    expect(checkRecapLine("You closed 80 cards.", FACTS)).toBeNull();
  });
  it("rejects over 140 chars, extra sentences, exclamation marks, emoji, no 'you'", () => {
    expect(checkRecapLine(`You ${"closed cards ".repeat(12)}.`, FACTS)).toBeNull();
    expect(checkRecapLine("You closed 8 cards. You slipped 4.", FACTS)).toBeNull();
    expect(checkRecapLine("You closed 8 cards!", FACTS)).toBeNull();
    expect(checkRecapLine("You closed 8 cards 🎉.", FACTS)).toBeNull();
    expect(checkRecapLine("Eight cards closed, 8 total.", FACTS)).toBeNull();
    expect(checkRecapLine("You closed 8 cards.\nYou rested.", FACTS)).toBeNull();
    expect(checkRecapLine("", FACTS)).toBeNull();
  });
  it("a number from a project name in the facts is allowed", () => {
    expect(checkRecapLine("You spent time on Project 7.", ["top project: Project 7", "cards closed: 3"])).not.toBeNull();
  });
});

describe("recapTask through runTaskWith", () => {
  it("worked examples satisfy the schema and the validator", () => {
    for (const ex of recapTask.examples!) {
      expect(recapTask.schema.safeParse(ex.output).success).toBe(true);
      const facts = ex.user.split("\n").slice(1).map((l) => l.replace(/^\d+\.\s*/, ""));
      expect(checkRecapLine(ex.output.line, facts)).toBe(ex.output.line);
    }
  });
  it("the prompt numbers the facts and stays under budget", () => {
    const p = recapTask.prompt({ period: "week", facts: FACTS });
    expect(p.user).toContain("3. learning: 2h 15m");
    expect(p.user.length).toBeLessThanOrEqual(recapTask.inputBudget);
  });
  it("a good reply passes; code then accepts it", async () => {
    const r = await run(json("You closed 8 cards and learned for 2h 15m."));
    expect(r.ok && checkRecapLine(r.data.line, FACTS)).toBe("You closed 8 cards and learned for 2h 15m.");
  });
  it("a fenced reply is parsed", async () => {
    const r = await run("```json\n" + json("You kept 4 slips small.") + "\n```");
    expect(r.ok).toBe(true);
  });
  it("an over-long line fails the schema (and the repair turn is spent)", async () => {
    const r = await run(json("x".repeat(141)));
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
  });
  it("a schema-valid reply with a made-up number is rejected by the code check", async () => {
    const r = await run(json("You closed 12 cards this week."));
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkRecapLine(r.data.line, FACTS)).toBeNull();
  });
  it("prose instead of JSON is invalid", async () => {
    expect(await run("Sure! You did great.")).toMatchObject({ ok: false });
  });
});

describe("facts and hashing", () => {
  it("hashFacts is stable and changes with the facts", () => {
    expect(hashFacts(FACTS)).toBe(hashFacts([...FACTS]));
    expect(hashFacts(FACTS)).not.toBe(hashFacts([...FACTS.slice(0, 4), "slipped: 5"]));
  });
  it("weekRecapFacts is short, labelled and capped at 8", () => {
    const review = {
      shippedCount: 8,
      shippedByProject: [
        { name: "A", emoji: null, cards: [{ id: "1", title: "t" }] },
        { name: "Side project", emoji: null, cards: [{ id: "2", title: "t" }, { id: "3", title: "t" }] },
      ],
      slipped: [1, 2, 3, 4],
      learningMinutesTotal: 135,
      spentMinorTotal: 13240,
      dominantCurrency: "USD",
      ideasCaptured: 2,
    } as unknown as WeekReview;
    expect(weekRecapFacts(review)).toEqual([
      "cards closed: 8",
      "top project: Side project",
      "learning: 2h 15m",
      "spent: $132.40",
      "slipped: 4",
      "ideas captured: 2",
    ]);
  });
  it("monthRecapFacts skips what is zero", () => {
    const s = {
      shippedCount: 31,
      topProject: null,
      learningMinutesTotal: 0,
      spentMinorTotal: 0,
      dominantCurrency: null,
      ideasCaptured: 6,
      activeDays: ["a", "b"],
    } as unknown as WrappedStats;
    expect(monthRecapFacts(s)).toEqual(["cards closed: 31", "ideas captured: 6", "active days: 2"]);
  });
});
