import { NextRequest, NextResponse } from "next/server";
import { ApiError, ok } from "@/lib/api-utils";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Cron endpoint: auto-suspends expired trials.
 *
 * Auth: Bearer <CRON_SECRET> (external cron) OR super_admin session cookie.
 * The SQL function suspend_expired_trials() handles audit logging.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (authHeader && cronSecret) {
      const token = authHeader.replace("Bearer ", "").trim();
      if (token !== cronSecret) {
        throw new ApiError("Invalid cron secret", 401);
      }
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new ApiError("Not authenticated", 401);
      if (user.app_metadata?.role !== "super_admin") {
        throw new ApiError("Platform admin only", 403);
      }
    }

    const svc = createServiceClient();

    const { data, error } = await svc.rpc("suspend_expired_trials");

    if (error) {
      throw new ApiError(`Failed to run trial expiration: ${error.message}`, 500);
    }

    const suspended = data || [];

    return NextResponse.json({
      success: true,
      data: {
        checked: true,
        suspendedCount: suspended.length,
        suspended: suspended.map((r: any) => ({
          tenantId: r.tenant_id,
          name: r.tenant_name,
          trialEndedAt: r.trial_ends_at,
          suspendedAt: r.suspended_at,
        })),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.status });
    }
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
