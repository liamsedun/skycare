"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

interface ComboboxProps {
  id?: string;
  name?: string;
  options: string[];
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Controlled value (use with onValueChange). When unset the combobox manages its own value. */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Transform helper applied to the typed value (e.g. uppercase) before it is used as a filter/option. */
  normalize?: (value: string) => string;
}

/**
 * Combobox: type to filter the dropdown, pick an option, or keep any value you
 * typed (the "add others" case — the value is submitted as-is via `name`).
 */
export function Combobox({
  id,
  name,
  options,
  placeholder,
  defaultValue = "",
  required,
  ariaLabel,
  className,
  value: controlledValue,
  onValueChange,
  normalize,
}: ComboboxProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = controlledValue ?? value;

  const setCurrent = (v: string) => {
    setValue(v);
    onValueChange?.(v);
  };

  const norm = normalize ?? ((v: string) => v);

  const filtered = options.filter((o) => {
    const f = norm(filter).toLowerCase();
    return !f || o.toLowerCase().includes(f);
  });

  const isCustom = current.trim() !== "" && !options.includes(current.trim());

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        required={required}
        value={current}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        onChange={(e) => {
          const v = norm(e.target.value);
          setCurrent(v);
          setFilter(v);
          setOpen(true);
        }}
        onFocus={() => {
          setFilter("");
          setOpen(true);
        }}
        className="w-full rounded-lg border border-[var(--color-border)] bg-white py-2.5 pl-3 pr-9 text-sm outline-none transition-colors duration-200 focus:border-[var(--color-primary)]"
      />
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            setFilter("");
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--color-muted-fg)] transition-colors duration-200 hover:bg-slate-100 hover:text-[var(--color-foreground)]"
        aria-label="Toggle options"
      >
        <ChevronDown size={15} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--color-border)] bg-white py-1 shadow-xl"
        >
          {isCustom && (
            <li
              role="option"
              aria-selected
              className="flex cursor-pointer items-center gap-2 bg-[var(--color-primary-soft)] px-3 py-2 text-sm font-medium text-[var(--color-primary-dark)]"
              onMouseDown={(e) => {
                e.preventDefault();
                setCurrent(norm(current));
                setOpen(false);
              }}
            >
              <Plus size={14} aria-hidden="true" /> Use “{current.trim()}”
            </li>
          )}
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--color-muted-fg)]">No matches — keep typing to add your own</li>
          ) : (
            filtered.map((option) => (
              <li
                key={option}
                role="option"
                aria-selected={current === option}
                className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-[var(--color-foreground)] transition-colors duration-100 hover:bg-[var(--color-muted)]/60"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setCurrent(norm(option));
                  setFilter("");
                  setOpen(false);
                }}
              >
                <span>{option}</span>
                {current === option && <Check size={14} className="text-[var(--color-primary)]" aria-hidden="true" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
