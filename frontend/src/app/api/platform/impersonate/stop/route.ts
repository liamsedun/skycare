import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

// Stop impersonation
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();
  const { session_id } = body;

  if (!session_id) throw new ApiError("session_id required", 400);

  const { data: session, error: sErr } = await svc
    .from("impersonation_sessions")
    .select("*")
    .eq("id", session_id)
    .eq("super_admin_id", user.id)
    .eq("status", "active")
    .single();

  if (sErr || !session) throw new ApiError("Active session not found", 404);

  const { error } = await svc
    .from("impersonation_sessions")
    .update({ status: "stopped", stopped_at: new Date().toISOString() })
    .eq("id", session_id);

  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "IMPERSONATE_STOP", entity_type: "impersonation_sessions", entity_id: session_id,
    user_id: user.id, user_email: user.email,
    description: `Stopped impersonation of tenant "${session.tenant_name}" (${session.tenant_id})`,
  });

  return ok({ stopped: true, tenant_id: session.tenant_id });
});
