import { NextResponse } from "next/server";
import { withAuth, requireTenant, ForbiddenError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Full-system backup — hospital_admin / super_admin within a tenant scope.
// Exports the tenant row + every tenant-scoped data table (children included
// via their parent ids) as JSON so the hospital can be rebuilt after a crash
// or during a software-developer → hospital-management handover.
// Excluded (transient / device-bound, cannot be restored meaningfully):
//   push_subscriptions, chat_presence
// Excluded from the JSON: nothing else — analytics_daily is included for
// snapshot fidelity (restore rebuilds it from triggers and skips the insert).

// Child tables carry no tenant_id — they are exported via their parent's ids.
const PARENT_CHILD: Record<string, { parent: string; column: string }> = {
  prescription_items: { parent: "prescriptions", column: "prescription_id" },
  invoice_items: { parent: "invoices", column: "invoice_id" },
  internal_message_recipients: { parent: "internal_messages", column: "message_id" },
  chat_messages: { parent: "chats", column: "chat_id" },
  drug_batches: { parent: "drugs", column: "drug_id" },
  po_items: { parent: "purchase_orders", column: "po_id" },
  lab_order_tests: { parent: "lab_orders", column: "order_id" },
  lab_results: { parent: "lab_order_tests", column: "order_test_id" },
  beds: { parent: "wards", column: "ward_id" },
};

const BACKUP_TABLES = [
  "branches",
  "users",
  "staff",
  "patients",
  "drugs",
  "suppliers",
  "lab_tests",
  "wards",
  "appointments",
  "visits",
  "medical_records",
  "doctor_notes",
  "medical_reports",
  "prescriptions",
  "lab_orders",
  "invoices",
  "payments",
  "expenses",
  "other_income",
  "purchase_orders",
  "goods_receipts",
  "requisitions",
  "stock_movements",
  "admissions",
  "staff_roster",
  "attendance",
  "staff_leave",
  "duty_roster",
  "notifications",
  "chats",
  "internal_messages",
  "hospital_bank_accounts",
  "landing_doctors",
  "notification_templates",
  "subscription_invoices",
  "audit_logs",
  "security_events",
  "analytics_daily",
] as const;

export const GET = withAuth(async (_req, ctx) => {
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);
  const svc = ctx.svc;

  const { data: tenantRows } = await svc.from("tenants").select("*").eq("id", tenantId);
  const tenant = tenantRows?.[0] ?? null;

  const payload: Record<string, any> = {
    version: 1,
    createdAt: new Date().toISOString(),
    tenantId,
    tenant,
    tables: {},
  };

  for (const table of BACKUP_TABLES) {
    const { data, error } = await svc.from(table).select("*").eq("tenant_id", tenantId);
    if (error) {
      console.error(`[backup] error reading ${table}:`, error.message);
      payload.tables[table] = [];
      continue;
    }
    payload.tables[table] = data || [];
  }

  for (const [child, { parent, column }] of Object.entries(PARENT_CHILD)) {
    const { data: parents } = await svc.from(parent).select("id").eq("tenant_id", tenantId);
    const parentIds = (parents || []).map((p: any) => p.id);
    let rows: any[] = [];
    for (let i = 0; i < parentIds.length; i += 100) {
      const { data, error } = await svc.from(child).select("*").in(column, parentIds.slice(i, i + 100));
      if (error) {
        console.error(`[backup] error reading ${child}:`, error.message);
        rows = [];
        break;
      }
      rows = rows.concat(data || []);
    }
    payload.tables[child] = rows;
  }

  const stamp = new Date().toISOString().split("T")[0];
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="skycare-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
