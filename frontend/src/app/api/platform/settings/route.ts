import { NextRequest, NextResponse } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  const { data: settings, error } = await svc
    .from("platform_settings")
    .select("*");

  if (error) throw new ApiError(error.message, 500);

  // Convert array to object
  const config: Record<string, unknown> = {};
  for (const s of settings || []) {
    config[s.key] = s.value;
  }

  return ok(config);
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  const body = await req.json();

  const updates: Array<{ key: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(body)) {
    if (typeof key !== "string") continue;
    updates.push({ key, value });
  }

  if (updates.length === 0) throw new ApiError("Nothing to update", 400);

  for (const { key, value } of updates) {
    const { error } = await svc
      .from("platform_settings")
      .upsert(
        { key, value, updated_by: user.id },
        { onConflict: "key" }
      );

    if (error) throw new ApiError(error.message, 500);
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "platform_settings",
    description: `Updated platform settings: ${updates.map((u) => u.key).join(", ")}`,
  });

  return ok({ updated: updates.length });
});
