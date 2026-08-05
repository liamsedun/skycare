import {
  withAuth,
  ok,
  okPaginated,
  ValidationError,
  ForbiddenError,
  requireTenant,
  getPagination,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import type { StaffRole } from "@/lib/auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/notifications?unread_only=&page=&pageSize= — my notifications
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const unreadOnly = req.nextUrl.searchParams.get("unread_only") === "true";

  let query = ctx.svc
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("user_id", ctx.user.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (unreadOnly) query = query.eq("is_read", false);

  const { data, count, error } = await query;
  if (error) throw new ValidationError(error.message);
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

interface AnnounceBody {
  title: string;
  message?: string;
  role?: StaffRole;
}

// POST /api/notifications — hospital admins broadcast an announcement to staff
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Only hospital admins can send announcements");
  }

  const body = (await req.json()) as AnnounceBody;
  if (!body.title?.trim()) throw new ValidationError("Title is required");

  let query = ctx.svc
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .neq("role", "patient_api")
    .eq("is_active", true);
  if (body.role) query = query.eq("role", body.role);
  const { data: users } = await query;
  const userIds = (users ?? []).map((u: any) => u.id).filter((id: string) => id !== ctx.user.id);
  if (userIds.length === 0) throw new ValidationError("No staff to notify");

  await notifyUsers(ctx.svc, {
    orgId: tenantId,
    userIds,
    type: "general",
    title: body.title.trim(),
    message: body.message?.trim(),
  });

  await logAudit(req, ctx, {
    action: "create",
    entityType: "notifications",
    description: `Announcement "${body.title.trim()}" sent to ${userIds.length} staff member(s)`,
  });

  return ok({ sent: userIds.length }, 201);
});

export const runtime = "nodejs";