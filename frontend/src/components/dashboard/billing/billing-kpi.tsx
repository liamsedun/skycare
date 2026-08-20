import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export function KpiCard({ label, value, icon: Icon, tone, hint }: { label: string; value: string; icon: LucideIcon; tone: "amber" | "emerald" | "sky" | "violet"; hint?: string }) {
  const [display, setDisplay] = useState(0);
  const target = useRef(0);
  const parsed = useMemo(() => {
    const raw = value.replace(/[^\d.-]/g, "");
    const n = Number(raw);
    target.current = Number.isFinite(n) ? n : 0;
    return target.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 600;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setDisplay(target.current * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [parsed]);

  const gradients: Record<string, string> = {
    amber: "from-amber-500 to-orange-600",
    emerald: "from-emerald-500 to-teal-600",
    sky: "from-sky-500 to-indigo-600",
    violet: "from-violet-500 to-purple-600",
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradients[tone]} p-5 text-white shadow-lg`}>
      <Icon size={88} aria-hidden="true" className="absolute -bottom-4 -right-4 text-white/15" />
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-white/80">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight">
            {new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(display)}
          </p>
        </div>
      </div>
      {hint ? <p className="mt-2 text-[11px] font-medium text-white/70">{hint}</p> : null}
    </div>
  );
}