import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { user } = ctx;
  const body = await req.json();

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword) throw new ApiError("Current and new passwords are required", 400);
  if (newPassword.length < 8) throw new ApiError("New password must be at least 8 characters", 400);

  // Verify current password by attempting sign in
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const verifyResp = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: currentPassword }),
  });

  if (!verifyResp.ok) {
    throw new ApiError("Current password is incorrect", 400);
  }

  // Update password via service role
  const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const updateResp = await fetch(`${SUPA_URL}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword }),
  });

  if (!updateResp.ok) {
    throw new ApiError("Failed to update password", 500);
  }

  return ok({ success: true, message: "Password updated successfully" });
});
