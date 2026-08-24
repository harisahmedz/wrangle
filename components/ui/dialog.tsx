"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
};

function useDialogBehavior(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const first = ref.current?.querySelector<HTMLElement>(
      "input, button, textarea, [tabindex]",
    );
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  return ref;
}

export function Modal({ open, onClose, children, className, label }: DialogProps) {
  const ref = useDialogBehavior(open, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  children,
  className,
  label,
  variant = "center",
}: DialogProps & { variant?: "center" | "side" }) {
  const ref = useDialogBehavior(open, onClose);
  const dragRef = useRef<{ startY: number; dy: number } | null>(null);

  const onHandleDown = (e: React.PointerEvent) => {
    if (window.innerWidth < 640) {
      dragRef.current = { startY: e.clientY, dy: 0 };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    if (ref.current) ref.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onHandleUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d && d.dy > 80) onClose();
    else if (ref.current) ref.current.style.transform = "";
  };

  if (!open) return null;
  return (
    <div
      className={
        variant === "side"
          ? "fixed inset-0 z-50 flex justify-end bg-black/60"
          : "fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      }
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full border-border bg-surface shadow-lg",
          variant === "side"
            ? "h-full max-h-none overflow-y-auto sm:max-w-md rounded-l-xl p-5"
            : "sm:max-w-md rounded-t-xl sm:rounded-xl p-5 max-h-[85dvh] overflow-y-auto",
          className,
        )}
      >
        {!variant || variant === "center" ? (
          <div
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            className="mx-auto mb-4 h-4 w-10 -touch-none rounded-full bg-border sm:hidden"
            style={{ touchAction: "none" }}
            role="presentation"
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}
