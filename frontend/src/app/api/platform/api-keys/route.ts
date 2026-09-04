import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";
import crypto from "crypto";

export const runtime = "nodejs";

const generateKey = () => {
  const prefix = "sk_" + crypto.randomBytes(4).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  const key = `${prefix}_${secret}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, prefix, hash };
};

// List API keys (super_admin only)
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { svc, role } = ctx;
  if (role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const tidFilter = req.nextUrl.searchParams.get("tenant_id");

  let query = svc
    .from("platform_api_keys")
    .select("id, name, prefix, scopes, last_used_at, expires_at, is_active, created_at, tenant_id");

  if (tidFilter) {
    query = query.eq("tenant_id", tidFilter).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false }).limit(100);
  }

  const { data, error } = await query;
  if (error) throw new ApiError(error.message, 500);
  return ok(data || []);
});

// Create API key (returns plaintext once)
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { svc, tenantId, role, user } = ctx;
  if (role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const body = await req.json();
  const tid = role === "super_admin" ? body.tenant_id || tenantId : tenantId;
  if (!tid) throw new ApiError("Tenant required", 400);

  const { name, scopes, expires_at } = body;

  if (!name) throw new ApiError("Name is required", 400);

  const { key, prefix, hash } = generateKey();

  const { data, error } = await svc.from("platform_api_keys").insert({
    tenant_id: tid,
    name,
    key_hash: hash,
    prefix,
    scopes: scopes || ["read"],
    expires_at: expires_at || null,
    is_active: true,
  }).select("id, name, prefix, scopes, expires_at, is_active, created_at").single();

  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "CREATE", entity_type: "platform_api_keys", entity_id: data.id,
    user_id: user.id, user_email: user.email,
    description: `Created API key "${name}" (${prefix}...)`,
  });

  // Return the key ONCE — never shown again
  return ok({ ...data, key }, 201);
});

// Revoke API key
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const { svc, tenantId, role, user } = ctx;
  if (role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError("ID required", 400);

  const tidFilter = role === "super_admin" ? req.nextUrl.searchParams.get("tenant_id") : tenantId;

  let query = svc.from("platform_api_keys").select("id, name, prefix").eq("id", id);
  if (tidFilter) query = query.eq("tenant_id", tidFilter);

  const { data: existing } = await query.single();

  if (!existing) throw new ApiError("Key not found", 404);

  const { error } = await svc
    .from("platform_api_keys")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "DELETE", entity_type: "platform_api_keys", entity_id: id,
    user_id: user.id, user_email: user.email,
    description: `Revoked API key "${existing.name}" (${existing.prefix}...)`,
  });

  return ok({ revoked: true });
});
