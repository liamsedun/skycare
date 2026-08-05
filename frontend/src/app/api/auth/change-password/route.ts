import { withAuth, ok, ValidationError, ForbiddenError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

// POST /api/auth/change-password — verify current password, then set a new one
export const POST = withAuth(async (req, ctx) => {
  const body = (await req.json()) as ChangePasswordBody;

  if (!body.currentPassword || !body.newPassword) {
    throw new ValidationError("Current password and new password are required");
  }
  if (body.newPassword.length < 8) {
    throw new ValidationError("New password must be at least 8 characters");
  }
  if (body.newPassword === body.currentPassword) {
    throw new ValidationError("New password must be different from the current password");
  }

  const email = ctx.user.email;
  if (!email) throw new ValidationError("Cannot identify your account");

  // Verify the current password by signing in with it (RLS client so the session stays intact).
  const { error: signInError } = await ctx.supabase.auth.signInWithPassword({
    email,
    password: body.currentPassword,
  });
  if (signInError) throw new ForbiddenError("Current password is incorrect");

  const { error: updateError } = await ctx.supabase.auth.updateUser({
    password: body.newPassword,
  });
  if (updateError) throw new ValidationError(updateError.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "users",
    entityId: ctx.user.id,
    description: "Changed own password",
  });

  return ok({ message: "Password updated successfully" });
});

export const runtime = "nodejs";