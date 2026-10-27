"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BoardKind } from "@/db/schema";
import { BoardView } from "@/components/kanban/board-view";
import { ListView } from "@/components/kanban/list-view";
import { ViewMenu } from "@/components/kanban/view-menu";
import { useToast } from "@/components/ui/toast";
import { setViewPref } from "@/lib/actions/settings";
import { withViewTransition } from "@/lib/view-transition";
import type { BoardCardData, BoardColumnData } from "@/lib/kanban/types";
import type { GroupBy, SortMode, ViewLayout, ViewPref } from "@/lib/validation/prefs";

type Props = {
  projectId: string;
  boardId: string;
  boardKind: BoardKind;
  columns: BoardColumnData[];
  cards: BoardCardData[];
  filterLabels: Array<{ id: string; name: string }>;
  filterMembers: Array<{ userId: string; name: string | null }>;
  canEdit: boolean;
  canManageColumns: boolean;
  toolbarEnd: ReactNode;
  timeZone: string;
  initialLayout: ViewLayout | null;
  initialGroupBy: GroupBy;
  initialSort: SortMode;
  initialShowCompleted: boolean;
};

/**
 * Board/List branch point (ROADMAP-V2 F1/F2). Owns the view-pref state and
 * persists changes via `setViewPref`; the data itself (`columns`/`cards`)
 * stays identical for both renderers — only the renderer changes.
 */
export function BoardSwitcher({
  projectId,
  boardId,
  boardKind,
  columns,
  cards,
  filterLabels,
  filterMembers,
  canEdit,
  canManageColumns,
  toolbarEnd,
  timeZone,
  initialLayout,
  initialGroupBy,
  initialSort,
  initialShowCompleted,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pushToast = useToast();
  const [layout, setLayout] = useState<ViewLayout | null>(initialLayout);
  const [groupBy, setGroupBy] = useState<GroupBy>(initialGroupBy);
  const [sort, setSort] = useState<SortMode>(initialSort);
  const [showCompleted, setShowCompleted] = useState(initialShowCompleted);
  const [, startTransition] = useTransition();

  const persist = (patch: ViewPref) => {
    const fd = new FormData();
    fd.set("boardId", boardId);
    fd.set("patch", JSON.stringify(patch));
    startTransition(() => {
      setViewPref(fd)
        .then((res) => {
          if (!res.ok) pushToast({ message: res.error });
        })
        .catch(() => pushToast({ message: "Couldn't save your view preference" }));
    });
  };

  // A `?view=` override wins over the saved pref (view-resolve.ts) — once
  // the user makes an explicit choice from the menu, drop it so the pref
  // they just saved isn't immediately shadowed by the URL on next load.
  const clearViewOverride = () => {
    if (!searchParams.has("view")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    const qs = params.toString();
    router.replace(`/p/${projectId}/b/${boardKind}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const viewMenu = (
    <ViewMenu
      layout={layout}
      groupBy={groupBy}
      sort={sort}
      showCompleted={showCompleted}
      showListOptions={layout !== "board"}
      onLayoutChange={(next) => {
        // Persist first so the save never depends on the transition below
        // (a visual nicety) succeeding.
        persist({ layout: next });
        clearViewOverride();
        // Subtle cross-fade between Board/List (V2 S7) — same-document state
        // swap, so the native API is called directly rather than through
        // Next's router.
        withViewTransition(() => setLayout(next));
      }}
      onGroupByChange={(next) => {
        setGroupBy(next);
        persist({ groupBy: next });
      }}
      onSortChange={(next) => {
        setSort(next);
        persist({ sort: next });
      }}
      onShowCompletedChange={(next) => {
        setShowCompleted(next);
        persist({ showCompleted: next });
      }}
    />
  );

  const boardNode = (
    <BoardView
      projectId={projectId}
      boardId={boardId}
      boardKind={boardKind}
      columns={columns}
      cards={cards}
      filterLabels={filterLabels}
      filterMembers={filterMembers}
      canEdit={canEdit}
      canManageColumns={canManageColumns}
      toolbarEnd={toolbarEnd}
      viewMenu={viewMenu}
      timeZone={timeZone}
    />
  );

  const listNode = (
    <ListView
      projectId={projectId}
      boardKind={boardKind}
      columns={columns}
      cards={cards}
      canEdit={canEdit}
      toolbarEnd={toolbarEnd}
      viewMenu={viewMenu}
      timeZone={timeZone}
      groupBy={groupBy}
      sort={sort}
      showCompleted={showCompleted}
    />
  );

  if (layout === "board") return boardNode;
  if (layout === "list") return listNode;

  // No explicit pref and no `?view=` override (D2): render both and let
  // `md:` CSS pick (phone = List, tablet/desktop = Board) so the first paint
  // already matches — no JS width-sniffing, no layout flash. The hidden
  // tree is `display:none`, so it's unreachable by pointer/keyboard and out
  // of the a11y tree even though both mount.
  return (
    <>
      <div className="hidden md:block">{boardNode}</div>
      <div className="md:hidden">{listNode}</div>
    </>
  );
}
