import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  const { data: users, error } = await svc
    .from("users")
    .select("id, email, full_name, role, is_active, created_at")
    .eq("role", "super_admin")
    .is("tenant_id", null)
    .order("created_at", { ascending: false });

  if (error) throw new ApiError(error.message, 500);

  return ok(users || []);
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user, supabase } = ctx;
  const body = await req.json();

  const { email, password, full_name } = body;

  if (!email || typeof email !== "string") throw new ApiError("Email is required", 400);
  if (!password || typeof password !== "string" || password.length < 8) {
    throw new ApiError("Password must be at least 8 characters", 400);
  }
  if (!full_name || typeof full_name !== "string") throw new ApiError("Full name is required", 400);

  const normalizedEmail = email.trim().toLowerCase();

  // Check for existing user
  const { data: existing } = await svc
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .single();

  if (existing) throw new ApiError("A user with this email already exists", 409);

  // Create auth user via service-role auth admin
  const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    app_metadata: {
      role: "super_admin",
      tenant_id: null,
    },
  });

  if (authErr || !authUser?.user) {
    throw new ApiError(authErr?.message || "Failed to create auth user", 500);
  }

  // Create users mirror row
  const { error: mirrorErr } = await svc.from("users").insert({
    id: authUser.user.id,
    email: normalizedEmail,
    full_name,
    role: "super_admin",
    tenant_id: null,
    is_active: true,
  });

  if (mirrorErr) {
    // Rollback: delete the auth user
    await supabase.auth.admin.deleteUser(authUser.user.id);
    throw new ApiError(mirrorErr.message, 500);
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "users",
    entityId: authUser.user.id,
    description: `Created platform admin: ${full_name} (${normalizedEmail})`,
  });

  return ok(
    {
      id: authUser.user.id,
      email: normalizedEmail,
      full_name,
      role: "super_admin",
      is_active: true,
    },
    201
  );
});
