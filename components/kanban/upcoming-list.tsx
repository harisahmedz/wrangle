import type { DayGroup } from "@/lib/kanban/upcoming";
import type { DueCardRow as DueCardRowData } from "@/lib/kanban/due-cards";
import { DueCardRow } from "@/components/tasks/due-card-row";

/** The "Overdue" pile at the top of Upcoming's agenda (V2 S6). */
export function OverdueGroup({
  rows,
  timeZone,
}: {
  rows: DueCardRowData[];
  timeZone: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-danger">Overdue ({rows.length})</h2>
      <ul>
        {rows.map((card) => (
          <DueCardRow key={card.id} card={card} timeZone={timeZone} showProject />
        ))}
      </ul>
    </section>
  );
}

/** One day's group of rows, anchored for the week strip's tap-to-scroll. */
export function DayGroupSection({
  group,
  timeZone,
}: {
  group: DayGroup;
  timeZone: string;
}) {
  return (
    <section id={`day-${group.key}`} className="scroll-mt-20 space-y-2">
      <h2 className="text-sm font-medium text-muted">{group.label}</h2>
      <ul>
        {group.rows.map((card) => (
          <DueCardRow key={card.id} card={card} timeZone={timeZone} showProject />
        ))}
      </ul>
    </section>
  );
}
