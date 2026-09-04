import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") || "";
  const priority = sp.get("priority") || "";
  const page = Number(sp.get("page")) || 1;
  const pageSize = Number(sp.get("pageSize")) || 30;

  let query = svc.from("support_tickets").select("*, tenant:tenants(name)", { count: "exact" });
  if (status) query = query.eq("status", status);
  if (priority) query = query.eq("priority", priority);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) throw new ApiError(error.message, 500);
  return ok({ rows: data || [], total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const { svc, user, tenantId } = ctx;
  const body = await req.json();
  const { subject, message, category, priority } = body;

  if (!subject || !message) throw new ApiError("Subject and message are required", 400);

  // Platform admins can create for any tenant, staff for their own
  const ticketTenantId = ctx.role === "super_admin" ? (body.tenantId || tenantId) : tenantId;
  if (!ticketTenantId) throw new ApiError("Tenant ID required", 400);

  const { data, error } = await svc.from("support_tickets").insert({
    tenant_id: ticketTenantId,
    user_id: user.id,
    subject,
    message,
    category: category || "general",
    priority: priority || "normal",
    status: "open",
  }).select().single();

  if (error) throw new ApiError(error.message, 500);
  return ok(data, 201);
});
