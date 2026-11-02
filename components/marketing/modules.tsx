import { Eyebrow, Heading } from "./section";
import { Frame, PhoneFrame, Shot } from "./shot";
import type { ShotName } from "./shot";
import { cn } from "@/lib/utils";

type Module = {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  shot: ShotName;
  alt: string;
  phone?: { shot: ShotName; alt: string };
};

const MODULES: Module[] = [
  {
    eyebrow: "Tasks",
    title: "Kanban when you have room. A list when you don't.",
    body: "Every board is both. Columns on a tablet or desktop, a clean list on a phone, and a View menu to switch whenever you like.",
    points: [
      "Drag cards between columns, or tick them off in the list",
      "Due dates, priorities and labels; quick add understands \"tomorrow 5pm p1\"",
      "Today and Upcoming pull due tasks from every project",
    ],
    shot: "tasks-board",
    alt: "A Wrangle kanban board with Backlog, Doing and Done columns",
    phone: { shot: "tasks-list", alt: "The same board as a list on a phone" },
  },
  {
    eyebrow: "Ideas",
    title: "Score the idea. Then promote it.",
    body: "Capture an idea raw, rate impact and effort, and sort by score. When one earns its place, promote it to a task in a click.",
    points: ["Impact × effort score on every idea", "Raw, Shortlist, Promoted: a pipeline, not a pile"],
    shot: "ideas",
    alt: "The Ideas board with Raw, Shortlist and Promoted columns and score badges",
  },
  {
    eyebrow: "Learning",
    title: "Want. Learning. Learned.",
    body: "Track what you are studying, from books to courses. Log sessions, tick off milestones and watch the progress bar fill.",
    points: ["Session log, milestones, resources and notes per item", "Link an item to a project board"],
    shot: "learn",
    alt: "The Learn pipeline with Want to learn, Learning and Learned columns",
  },
  {
    eyebrow: "Money",
    title: "Expenses without the spreadsheet.",
    body: "Log what you spend with a category and an optional receipt photo. See the month at a glance, with a category breakdown and a six-month trend.",
    points: ["Receipts attached to the expense", "Month switcher, category donut and trend bars"],
    shot: "money",
    alt: "The Money page with a monthly total, category donut and expense list",
  },
];

export function Modules() {
  return (
    <>
      {MODULES.map((m, i) => (
        <div
          key={m.eyebrow}
          className={cn("grid items-center gap-10 py-12 md:grid-cols-2 md:gap-16", i === 0 && "pt-0")}
        >
          <div className={cn(i % 2 === 1 && "md:order-2")}>
            <Eyebrow>{m.eyebrow}</Eyebrow>
            <Heading>{m.title}</Heading>
            <p className="mt-4 text-lg text-muted">{m.body}</p>
            <ul className="mt-5 space-y-2 text-text">
              {m.points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className={cn("relative", m.phone && "pb-12 md:pb-16", i % 2 === 1 && "md:order-1")}>
            <Frame>
              <Shot name={m.shot} alt={m.alt} sizes="(min-width: 1152px) 540px, (min-width: 768px) 45vw, 90vw" />
            </Frame>
            {m.phone && (
              <PhoneFrame className="absolute -bottom-2 right-3 w-[32%] max-w-44">
                <Shot name={m.phone.shot} alt={m.phone.alt} sizes="180px" />
              </PhoneFrame>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
