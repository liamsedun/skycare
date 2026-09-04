import { NextRequest } from "next/server";
import { withAuth, ok, ApiError } from "@/lib/api-utils";

export const runtime = "nodejs";

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "super_admin") throw new ApiError("Platform admin only", 403);
  const { svc, user } = ctx;
  // ticket id is second-to-last segment
  const segs = req.url.split("/").filter(Boolean);
  const ticketId = segs[segs.length - 2];
  const body = await req.json();
  const { message, is_internal } = body;

  if (!message) throw new ApiError("Message is required", 400);

  const { data: ticket } = await svc.from("support_tickets").select("id, status").eq("id", ticketId).single();
  if (!ticket) throw new ApiError("Ticket not found", 404);

  const { data, error } = await svc.from("ticket_messages").insert({
    ticket_id: ticketId,
    user_id: user.id,
    message,
    is_internal: !!is_internal,
  }).select().single();

  if (error) throw new ApiError(error.message, 500);

  // Auto-move to in_progress if currently open
  if (ticket.status === "open") {
    await svc.from("support_tickets").update({ status: "in_progress" }).eq("id", ticketId);
  }

  return ok(data, 201);
});
