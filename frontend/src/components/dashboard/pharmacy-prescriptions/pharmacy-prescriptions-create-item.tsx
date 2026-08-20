import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DrugOption, inputCls } from "./pharmacy-prescriptions-shared";

export interface CreateItem {
  medicationName: string;
  pharmacyDrugId: string | null;
  dosage: string;
  frequency: string;
  route: string;
  duration: string;
  quantity: number;
  instructions: string;
}

export function newItem(): CreateItem {
  return { medicationName: "", pharmacyDrugId: null, dosage: "1", frequency: "1x daily", route: "oral", duration: "", quantity: 10, instructions: "" };
}

// Medication row with catalog search — type to search pharmacy_drugs; a match
// locks the pharmacyDrugId so dispensing can target stock batches.
export function CreateItemRow({ item, onChange, onRemove, canRemove }: { item: CreateItem; onChange: (i: CreateItem) => void; onRemove: () => void; canRemove: boolean }) {
  const [query, setQuery] = useState(item.medicationName);
  const [results, setResults] = useState<DrugOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchSeq = useRef(0);

  const debouncedSearch = useCallback((q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    const myId = ++searchSeq.current;
    fetch(`/api/pharmacy/drugs?query=${encodeURIComponent(q.trim())}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (myId !== searchSeq.current) return;
        setResults(body.data ?? []);
        setOpen(true);
      })
      .catch(() => {
        if (myId === searchSeq.current) setResults([]);
      })
      .finally(() => {
        if (myId === searchSeq.current) setSearching(false);
      });
  }, []);

  useEffect(() => {
    if (item.pharmacyDrugId) return;
    const t = setTimeout(() => debouncedSearch(query), 400);
    return () => clearTimeout(t);
  }, [query, item.pharmacyDrugId, debouncedSearch]);

  const pick = (d: DrugOption) => {
    onChange({ ...item, medicationName: d.name, pharmacyDrugId: d.id });
    setQuery(d.name);
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3">
      <div className="grid grid-cols-12 gap-2">
        <div className="relative col-span-12 sm:col-span-6">
          <input
            ref={inputRef}
            value={item.pharmacyDrugId ? item.medicationName : query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              onChange({ ...item, medicationName: v, pharmacyDrugId: null });
            }}
            onFocus={() => {
              if (!item.pharmacyDrugId) setOpen(true);
            }}
            placeholder="Search medication (catalog)…"
            required
            className={inputCls}
          />
          {open && (searching || results.length > 0) && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-lg">
              {searching && (
                <li className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">Searching…</li>
              )}
              {!searching &&
                results.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => pick(d)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-primary-soft)]"
                    >
                      <span className="block font-medium text-[var(--color-foreground)]">{d.name}</span>
                      <span className="block text-xs text-[var(--color-muted-fg)]">
                        {[d.dosage, d.category].filter(Boolean).join(" · ") || " "}
                        {" · "}
                        {!d.inStock ? (
                          <span className="font-semibold text-red-500">out of stock</span>
                        ) : (
                          <span className="font-semibold text-emerald-600">in stock</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              {!searching && results.length === 0 && (
                <li className="px-3 py-2 text-xs text-[var(--color-muted-fg)]">No catalog match — free text allowed</li>
              )}
            </ul>
          )}
        </div>
        <input
          value={item.dosage}
          onChange={(e) => onChange({ ...item, dosage: e.target.value })}
          placeholder="Dosage"
          className={`${inputCls} col-span-6 sm:col-span-2`}
        />
        <input
          value={item.frequency}
          onChange={(e) => onChange({ ...item, frequency: e.target.value })}
          placeholder="Frequency"
          className={`${inputCls} col-span-6 sm:col-span-3`}
        />
        <input
          value={item.route}
          onChange={(e) => onChange({ ...item, route: e.target.value })}
          placeholder="Route"
          className={`${inputCls} col-span-4 sm:col-span-2`}
        />
        <input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) => onChange({ ...item, quantity: Number(e.target.value) })}
          placeholder="Qty"
          className={`${inputCls} col-span-4 sm:col-span-2`}
        />
        <input
          value={item.duration}
          onChange={(e) => onChange({ ...item, duration: e.target.value })}
          placeholder="Duration (e.g. 7 days)"
          className={`${inputCls} col-span-4 sm:col-span-2`}
        />
        <input
          value={item.instructions}
          onChange={(e) => onChange({ ...item, instructions: e.target.value })}
          placeholder="Instructions (optional)"
          className={`${inputCls} col-span-11 sm:col-span-10`}
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="focus-ring col-span-1 flex items-center justify-center rounded-lg text-[var(--color-muted-fg)] hover:text-red-500 disabled:opacity-30"
          aria-label="Remove medication"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}