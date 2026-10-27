"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewMenu } from "@/components/kanban/view-menu";
import { LearnBoard } from "@/components/learn/learn-board";
import { LearnListView } from "@/components/learn/learn-list-view";
import type { LearnItemRow } from "@/components/learn/types";
import { useToast } from "@/components/ui/toast";
import { setViewPref } from "@/lib/actions/settings";
import { LEARN_VIEW_KEY, type ViewLayout, type ViewPref } from "@/lib/validation/prefs";

type Props = {
  items: LearnItemRow[];
  initialLayout: ViewLayout | null;
};

/**
 * Learn's Board/List branch point (V2 S4b, backlog B80) — mirrors
 * `BoardSwitcher` (ROADMAP-V2 F1/F2): owns the layout state, persists it via
 * `setViewPref` under the reserved `LEARN_VIEW_KEY`, and (with no saved pref
 * and no `?view=` override) renders both renderers so `md:` CSS picks Board
 * on tablet/desktop and List on phone with no layout flash.
 */
export function LearnSwitcher({ items, initialLayout }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pushToast = useToast();
  const [layout, setLayout] = useState<ViewLayout | null>(initialLayout);
  const [, startTransition] = useTransition();

  const persist = (patch: ViewPref) => {
    const fd = new FormData();
    fd.set("boardId", LEARN_VIEW_KEY);
    fd.set("patch", JSON.stringify(patch));
    startTransition(() => {
      setViewPref(fd)
        .then((res) => {
          if (!res.ok) pushToast({ message: res.error });
        })
        .catch(() => pushToast({ message: "Couldn't save your view preference" }));
    });
  };

  const clearViewOverride = () => {
    if (!searchParams.has("view")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    const qs = params.toString();
    router.replace(`/learn${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const viewMenu = (
    <ViewMenu
      layout={layout}
      layoutOnly
      onLayoutChange={(next) => {
        setLayout(next);
        persist({ layout: next });
        clearViewOverride();
      }}
    />
  );

  const boardNode = <LearnBoard items={items} viewMenu={viewMenu} />;
  const listNode = <LearnListView items={items} viewMenu={viewMenu} />;

  if (layout === "board") return boardNode;
  if (layout === "list") return listNode;

  return (
    <>
      <div className="hidden md:block">{boardNode}</div>
      <div className="md:hidden">{listNode}</div>
    </>
  );
}
