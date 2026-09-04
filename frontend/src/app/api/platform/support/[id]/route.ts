import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();

  const { data: ticket, error: tErr } = await svc
    .from("support_tickets").select("*, tenant:tenants(name)").eq("id", id).single();
  if (tErr || !ticket) throw new ApiError("Ticket not found", 404);

  const { data: messages, error: mErr } = await svc
    .from("ticket_messages").select("*").eq("ticket_id", id).order("created_at", { ascending: true });
  if (mErr) throw new ApiError(mErr.message, 500);

  return ok({ ...ticket, messages: messages || [] });
});

export const PUT = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc } = ctx;
  const id = req.url.split("/").filter(Boolean).pop();
  const body = await req.json();

  const { data: existing } = await svc.from("support_tickets").select("*").eq("id", id).single();
  if (!existing) throw new ApiError("Ticket not found", 404);

  const patch: Record<string, unknown> = {};
  if (body.status) {
    patch.status = body.status;
    if (body.status === "resolved" || body.status === "closed") {
      patch.closed_at = new Date().toISOString();
      patch.resolution = body.resolution || null;
    } else {
      patch.closed_at = null;
    }
  }
  if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to;
  if (body.resolution !== undefined) patch.resolution = body.resolution;

  const { data, error } = await svc.from("support_tickets").update(patch).eq("id", id).select().single();
  if (error) throw new ApiError(error.message, 500);

  await svc.from("platform_audit_logs").insert({
    action: "UPDATE", entity_type: "support_tickets", entity_id: id,
    user_id: ctx.user.id, user_email: ctx.user.email,
    description: `Updated ticket "${existing.subject}" status to ${body.status || existing.status}`,
  });

  return ok(data);
});
