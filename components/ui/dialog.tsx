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

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) =>
      el.getClientRects().length > 0 &&
      el.getAttribute("aria-disabled") !== "true",
  );
}

let scrollLockDepth = 0;
let savedBodyOverflow = "";
let savedBodyPaddingRight = "";

function lockBodyScroll() {
  scrollLockDepth += 1;
  if (scrollLockDepth > 1) return;
  savedBodyOverflow = document.body.style.overflow;
  savedBodyPaddingRight = document.body.style.paddingRight;
  const scrollbarWidth =
    window.innerWidth - document.documentElement.clientWidth;
  document.body.style.overflow = "hidden";
  if (scrollbarWidth > 0)
    document.body.style.paddingRight = `${scrollbarWidth}px`;
}

function unlockBodyScroll() {
  if (scrollLockDepth === 0) return;
  scrollLockDepth -= 1;
  if (scrollLockDepth > 0) return;
  document.body.style.overflow = savedBodyOverflow;
  document.body.style.paddingRight = savedBodyPaddingRight;
}

const inertOriginals = new Map<HTMLElement, boolean>();
const inertClaims = new Map<number, HTMLElement[]>();
let nextInertClaimId = 1;

function claimInertBackground(root: HTMLElement) {
  const id = nextInertClaimId++;
  const touched: HTMLElement[] = [];
  let node: HTMLElement | null = root;
  while (node) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement)) continue;
      if (!inertOriginals.has(sibling))
        inertOriginals.set(sibling, sibling.inert);
      sibling.inert = true;
      touched.push(sibling);
    }
    node = parent === document.body ? null : parent;
  }
  inertClaims.set(id, touched);
  return id;
}

function releaseInertBackground(id: number) {
  const touched = inertClaims.get(id);
  inertClaims.delete(id);
  if (!touched) return;
  const stillClaimed = new Set<HTMLElement>();
  for (const others of inertClaims.values()) {
    for (const el of others) stillClaimed.add(el);
  }
  for (const el of touched) {
    if (stillClaimed.has(el)) continue;
    el.inert = inertOriginals.get(el) ?? false;
    inertOriginals.delete(el);
  }
}

function useDialogBehavior(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const inertId = root ? claimInertBackground(root) : null;
    lockBodyScroll();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const focusables = getFocusableElements(ref.current);
      if (focusables.length === 0) {
        e.preventDefault();
        ref.current.focus();
        return;
      }
      const activeIndex = focusables.indexOf(
        document.activeElement as HTMLElement,
      );
      if (e.shiftKey) {
        if (activeIndex <= 0) {
          e.preventDefault();
          focusables[focusables.length - 1].focus();
        }
      } else if (activeIndex === -1 || activeIndex === focusables.length - 1) {
        e.preventDefault();
        focusables[0].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const first = root ? getFocusableElements(root)[0] : undefined;
    if (first) first.focus();
    else root?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlockBodyScroll();
      if (inertId !== null) releaseInertBackground(inertId);
      previouslyFocused?.focus();
    };
  }, [open]);

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
        tabIndex={-1}
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
        tabIndex={-1}
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
