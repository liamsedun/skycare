import { withStaff, ok } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notifications/vapid-public-key — VAPID public key for web push.
// Returns configured:false when the deployment has no VAPID key set (the
// Download App page falls back to in-app instructions in that case).
export const GET = withStaff(async (req, ctx) => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  if (!publicKey) return ok({ configured: false, publicKey: null });
  return ok({ configured: true, publicKey });
});

export const runtime = "nodejs";