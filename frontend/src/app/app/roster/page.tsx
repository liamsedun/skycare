import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Roster was duplicated: the legacy duty-roster page (/app/roster) is now
// consolidated into the HR module's Shifts & Roster (/app/hr/roster), which
// supports shift templates, month grids and conflict guards.
export default function RosterPage() {
  redirect("/app/hr/roster");
}