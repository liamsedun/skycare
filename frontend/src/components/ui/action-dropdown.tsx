"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface DropdownItem {
  label: string;
  description?: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface ActionDropdownProps {
  label: string;
  items: DropdownItem[];
  icon?: ReactNode;
  variant?: "primary" | "outline";
  align?: "left" | "right";
  ariaLabel?: string;
  className?: string;
}

export function ActionDropdown({
  label,
  items,
  icon,
  variant = "primary",
  align = "right",
  ariaLabel,
  className,
}: ActionDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const base =
    variant === "primary"
      ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]"
      : "border border-[var(--color-border)] bg-white text-[var(--color-foreground)] hover:bg-[var(--color-muted)]";

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        className={`focus-ring inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors duration-200 ${base}`}
      >
        {icon}
        {label}
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white py-1 shadow-[var(--shadow-lg)]`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-xs font-medium transition-colors duration-150 hover:bg-[var(--color-muted)] ${
                item.danger ? "text-red-600 hover:bg-red-50" : "text-[var(--color-foreground)]"
              }`}
            >
              {item.icon && (
                <span className="mt-0.5 shrink-0 text-[var(--color-primary)]">{item.icon}</span>
              )}
              <span className="min-w-0">
                <span className="block truncate">{item.label}</span>
                {item.description && (
                  <span className="block truncate text-[11px] font-normal text-[var(--color-muted-fg)]">
                    {item.description}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}