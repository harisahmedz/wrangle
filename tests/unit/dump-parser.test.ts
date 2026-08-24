import { describe, expect, it } from "vitest";
import {
  parseDump,
  type DumpExpenseItem,
  type DumpIdeaItem,
  type DumpLearningItem,
  type DumpTaskItem,
} from "@/lib/dump/parser";

const NOW = new Date(Date.UTC(2026, 7, 25, 12, 0, 0));
const OPTS = { now: NOW, tz: "UTC" } as const;

function kinds(items: ReturnType<typeof parseDump>) {
  return items.map((i) => i.kind);
}

describe("parseDump — flagship example", () => {
  const line =
    "spent 8.50 on fuel yesterday… idea: dark mode for the blog… call Ali tomorrow at 5… did 40 minutes of the postgres course";

  it("splits one breath into four buckets", () => {
    const items = parseDump(line, OPTS);
    expect(kinds(items)).toEqual(["expense", "idea", "task", "learning"]);
  });

  it("parses the expense with amount, note and yesterday's date", () => {
    const items = parseDump(line, OPTS);
    const expense = items[0] as DumpExpenseItem;
    expect(expense.amountMinor).toBe(850);
    expect(expense.note).toBe("fuel");
    expect(expense.spentOn).toBe("2026-08-24");
  });

  it("parses the idea title", () => {
    const idea = parseDump(line, OPTS)[1] as DumpIdeaItem;
    expect(idea.title).toBe("dark mode for the blog");
  });

  it("parses the task with tomorrow 17:00 due", () => {
    const task = parseDump(line, OPTS)[2] as DumpTaskItem;
    expect(task.title).toBe("Call Ali");
    expect(task.isAllDay).toBe(false);
    expect(task.dueAt?.toISOString()).toBe("2026-08-26T17:00:00.000Z");
  });

  it("parses the learning minutes and topic", () => {
    const learning = parseDump(line, OPTS)[3] as DumpLearningItem;
    expect(learning.minutes).toBe(40);
    expect(learning.topic).toBe("postgres course");
  });

  it("assigns stable index-based ids", () => {
    const items = parseDump(line, OPTS);
    expect(items.map((i) => i.id)).toEqual(["seg-0", "seg-1", "seg-2", "seg-3"]);
  });
});

describe("parseDump — tasks", () => {
  it("keeps a plain task without a date", () => {
    const [task] = parseDump("water the plants", OPTS) as DumpTaskItem[];
    expect(task.kind).toBe("task");
    expect(task.title).toBe("Water the plants");
    expect(task.dueAt).toBeNull();
    expect(task.isAllDay).toBe(false);
  });

  it("makes weekday-only dates all-day at local noon", () => {
    const [task] = parseDump("dentist friday", OPTS) as DumpTaskItem[];
    expect(task.title).toBe("Dentist");
    expect(task.isAllDay).toBe(true);
    expect(task.dueAt?.toISOString()).toBe("2026-08-28T12:00:00.000Z");
  });
});

describe("parseDump — expenses", () => {
  it("handles comma decimals", () => {
    const [expense] = parseDump("spent 12,50 on coffee", OPTS) as DumpExpenseItem[];
    expect(expense.amountMinor).toBe(1250);
    expect(expense.note).toBe("coffee");
    expect(expense.spentOn).toBe("2026-08-25");
  });

  it("falls back to a task when an expense cue has no amount", () => {
    const items = parseDump("spent hours on taxes", OPTS);
    expect(kinds(items)).toEqual(["task"]);
    expect((items[0] as DumpTaskItem).title).toBe("Spent hours on taxes");
    expect((items[0] as DumpTaskItem).dueAt).toBeNull();
  });

  it("accepts an explicit currency symbol without a cue word", () => {
    const [expense] = parseDump("$9 for parking", OPTS) as DumpExpenseItem[];
    expect(expense.amountMinor).toBe(900);
    expect(expense.note).toBe("parking");
  });
});

describe("parseDump — ideas", () => {
  it("supports prefix variants", () => {
    const inputs = [
      "idea - add offline mode",
      "IDEA – export to csv",
      "idea: voice notes",
    ];
    const expected = ["add offline mode", "export to csv", "voice notes"];
    inputs.forEach((input, i) => {
      const items = parseDump(input, OPTS);
      expect(kinds(items)).toEqual(["idea"]);
      expect((items[0] as DumpIdeaItem).title).toBe(expected[i]);
    });
  });
});

describe("parseDump — learning", () => {
  it("normalizes compound hours and minutes", () => {
    const [item] = parseDump("learned 1h30 on the react course", OPTS) as DumpLearningItem[];
    expect(item.minutes).toBe(90);
    expect(item.topic).toBe("react course");
  });

  it("strips filler words from the topic", () => {
    const [item] = parseDump("did 25 min of my spanish flashcards", OPTS) as DumpLearningItem[];
    expect(item.minutes).toBe(25);
    expect(item.topic).toBe("spanish flashcards");
  });

  it("reads plain hour durations", () => {
    const [item] = parseDump("read 2 hours of dune", OPTS) as DumpLearningItem[];
    expect(item.minutes).toBe(120);
    expect(item.topic).toBe("dune");
  });
});

describe("parseDump — segmentation", () => {
  it("splits multi-line input", () => {
    const items = parseDump(
      "call mum\nspent 3.20 on tea\nlearned 15 min kata",
      OPTS,
    );
    expect(kinds(items)).toEqual(["task", "expense", "learning"]);
    expect((items[1] as DumpExpenseItem).amountMinor).toBe(320);
    expect((items[2] as DumpLearningItem).minutes).toBe(15);
  });

  it("splits embedded clauses inside one line", () => {
    const items = parseDump("bought coffee idea: cold brew ratings", OPTS);
    expect(kinds(items)).toEqual(["task", "idea"]);
    expect((items[0] as DumpTaskItem).title).toBe("Bought coffee");
    expect((items[1] as DumpIdeaItem).title).toBe("cold brew ratings");
  });

  it("trims trailing ellipses and punctuation", () => {
    const items = parseDump("book flights…", OPTS);
    expect(kinds(items)).toEqual(["task"]);
    expect((items[0] as DumpTaskItem).title).toBe("Book flights");
  });

  it("returns [] for empty or whitespace input", () => {
    expect(parseDump("", OPTS)).toEqual([]);
    expect(parseDump("   \n\t  ", OPTS)).toEqual([]);
  });
});
