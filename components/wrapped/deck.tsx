"use client";

import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { renderSlideToBlob } from "@/components/wrapped/render-card";
import {
  buildSlides,
  SLIDE_PALETTES,
} from "@/components/wrapped/slides";
import type { Archetype } from "@/lib/wrapped/archetype";
import type { WrappedStats } from "@/lib/wrapped/types";

function fileNameFor(monthLabel: string, index: number): string {
  const key = monthLabel.toLowerCase().replace(/\s+/g, "-");
  return `wrangle-${key}-${index + 1}.png`;
}

export function WrappedDeck({
  monthLabel,
  stats,
  archetype,
}: {
  monthLabel: string;
  stats: WrappedStats;
  archetype: Archetype;
}) {
  const slides = useMemo(
    () => buildSlides(monthLabel, stats, archetype),
    [monthLabel, stats, archetype],
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [rendering, setRendering] = useState(false);
  const pushToast = useToast();

  const goTo = (index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: index * el.clientHeight, behavior: "smooth" });
  };

  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el || el.clientHeight === 0) return;
    const next = Math.round(el.scrollTop / el.clientHeight);
    setActive(Math.max(0, Math.min(slides.length - 1, next)));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      goTo(active + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(active - 1);
    }
  };

  const shareCurrent = async () => {
    const slide = slides[active];
    setRendering(true);
    try {
      const blob = await renderSlideToBlob(slide);
      const file = new File([blob], fileNameFor(monthLabel, active), {
        type: "image/png",
      });
      type ShareNavigator = Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
      };
      const nav = navigator as ShareNavigator;
      if (typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: `${monthLabel} · Wrangle` });
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
      pushToast({ message: "Card saved to your device" });
    } catch (err) {
      if ((err as DOMException | null)?.name !== "AbortError") {
        pushToast({ message: "Could not create the image" });
      }
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div
        style={{ height: "min(78svh, 640px)", aspectRatio: "9 / 16" }}
        className="relative mx-auto"
      >
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="group"
          aria-label={`${monthLabel} recap cards`}
          className="h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-2xl border border-border shadow-lg outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, i) => {
            const palette =
              SLIDE_PALETTES[slide.palette % SLIDE_PALETTES.length];
            return (
              <article
                key={slide.id}
                aria-hidden={i !== active}
                className="flex h-full w-full snap-start snap-always select-none flex-col justify-between p-7"
                style={{
                  background: `linear-gradient(165deg, ${palette[0]} 0%, ${palette[0]} 30%, ${palette[1]} 140%)`,
                }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                  {slide.eyebrow}
                </p>
                <div>
                  <h2
                    className={`font-black leading-none tracking-tight text-white ${
                      slide.big ? "text-8xl tabular-nums" : "text-4xl"
                    }`}
                  >
                    {slide.headline}
                  </h2>
                  <div className="mt-5 space-y-2">
                    {slide.lines.map((line) => (
                      <p
                        key={line}
                        className="text-sm font-medium text-white/85"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                  {slide.footnote && (
                    <p className="mt-4 text-xs text-white/55">
                      {slide.footnote}
                    </p>
                  )}
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-xs tabular-nums text-white/40">
                    {i + 1}/{slides.length}
                  </span>
                  {slide.wordmark ? (
                    <span className="text-sm font-bold tracking-tight text-white/90">
                      wrangle ▪
                    </span>
                  ) : (
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white/25" />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div
        className="mt-4 flex items-center justify-center gap-1.5"
        role="tablist"
        aria-label="Card position"
      >
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            role="tab"
            aria-selected={i === active}
            aria-label={`Go to card ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${
              i === active ? "w-5 bg-accent-strong" : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>

      <button
        onClick={shareCurrent}
        disabled={rendering}
        className="mt-5 w-full rounded-md bg-accent px-4 py-3 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-strong disabled:opacity-50"
      >
        {rendering ? "Rendering…" : `Share card ${active + 1}`}
      </button>
    </div>
  );
}
