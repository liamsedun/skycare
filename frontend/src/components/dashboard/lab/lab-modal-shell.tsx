"use client";

import type { ReactNode } from "react";
import { flexBetween, ghostIconBtn, modalBackdrop } from "@/lib/ui-constants";

export function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`my-4 w-full rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className={flexBetween}>
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className={ghostIconBtn} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}