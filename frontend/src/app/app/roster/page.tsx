import { Suspense } from "react";
import RosterView from "@/components/dashboard/roster-view";

export const dynamic = "force-dynamic";

export default function RosterPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-sm text-[var(--color-muted-fg)]">Loading roster…</p>}>
      <RosterView />
    </Suspense>
  );
}