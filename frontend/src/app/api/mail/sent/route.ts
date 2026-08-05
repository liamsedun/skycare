import { withAuth, okPaginated, ValidationError, requireTenant, getPagination } from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/mail/sent?page=&pageSize= — messages I sent
export const GET = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);

  const { data, count, error } = await ctx.svc
    .from("internal_messages")
    .select(
      "id, subject, body, is_broadcast, broadcast_scope, created_at, internal_message_recipients(recipient_id, is_read, users!internal_message_recipients_recipient_id_fkey(id, full_name, email))",
      { count: "exact" }
    )
    .eq("sender_id", ctx.user.id)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new ValidationError(error.message);

  const rows = (data ?? []).map((m: any) => ({
    ...m,
    recipients: (m.internal_message_recipients ?? []).map((r: any) => r.users),
  }));

  return okPaginated(rows, count ?? 0, page, pageSize);
});

export const runtime = "nodejs";