"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function PlatformModal({
  open,
  onClose,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="platform-overlay flex items-end justify-center sm:items-center" onClick={onClose}>
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[90vh] flex-col rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:static sm:bottom-auto sm:left-auto sm:right-auto sm:mx-auto sm:my-8 sm:max-h-[85vh] sm:rounded-xl ${maxWidth}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 mt-3 hidden h-1 w-10 shrink-0 rounded-full bg-[var(--color-border)] sm:block" />
        <div className="overflow-y-auto px-5 pb-8 pt-2 sm:px-6 sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
