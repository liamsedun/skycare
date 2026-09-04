import { NextRequest } from "next/server";
import { withAuth, ok, ApiError, getPagination } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;

  const sp = req.nextUrl.searchParams;
  const page = Number(sp.get("page")) || 1;
  const pageSize = Number(sp.get("pageSize")) || 30;
  const search = sp.get("search") || "";
  const action = sp.get("action") || "";
  const entityType = sp.get("entityType") || "";

  let query = svc.from("platform_audit_logs").select("*", { count: "exact" });

  if (search) {
    query = query.or(`description.ilike.%${search}%,user_email.ilike.%${search}%,entity_type.ilike.%${search}%`);
  }
  if (action) {
    query = query.eq("action", action);
  }
  if (entityType) {
    query = query.eq("entity_type", entityType);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new ApiError(error.message, 500);

  return ok({
    rows: data || [],
    total: count || 0,
    page,
    pageSize,
    totalPages: Math.ceil((count || 0) / pageSize),
  });
});
