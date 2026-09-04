import { withAuth, requireTenant, ForbiddenError, ok, err } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/system/reset — hospital_admin within a tenant scope.
//
// Wipes all entered data (users except the caller, patients, staff, clinical
// records, prescriptions, lab orders, invoices, payments, expenses, other
// income, appointments, visits, admissions, pharmacy movements, purchases,
// requisitions, attendance, rosters, leave, chats, internal mail,
// notifications, audit logs, security events, analytics) while keeping the
// system configuration: tenant profile/settings, branches, drug catalog,
// suppliers, lab test catalog, wards & beds, bank accounts, landing doctors,
// notification templates, and subscription invoices.
//
// Intended for the software-developer → hospital-management handover.

const DELETE_TABLES = [
  "duty_roster",
  "internal_messages",
  "chats",
  "notifications",
  "doctor_notes",
  "medical_reports",
  "prescriptions",
  "medical_records",
  "lab_orders",
  "invoices",
  "payments",
  "expenses",
  "other_income",
  "stock_movements",
  "goods_receipts",
  "requisitions",
  "purchase_orders",
  "admissions",
  "visits",
  "appointments",
  "attendance",
  "staff_roster",
  "staff_leave",
  "audit_logs",
  "security_events",
  "analytics_daily",
  "patients",
  "staff",
];

// Tables without a tenant_id column — wiped via their parent's tenant-scoped ids.
const CHILD_TABLES: Record<string, { parent: string; column: string }> = {
  internal_message_recipients: { parent: "internal_messages", column: "message_id" },
  chat_messages: { parent: "chats", column: "chat_id" },
  chat_presence: { parent: "users", column: "user_id" },
  push_subscriptions: { parent: "users", column: "user_id" },
  prescription_items: { parent: "prescriptions", column: "prescription_id" },
  invoice_items: { parent: "invoices", column: "invoice_id" },
  lab_results: { parent: "lab_order_tests", column: "order_test_id" },
  lab_order_tests: { parent: "lab_orders", column: "order_id" },
  po_items: { parent: "purchase_orders", column: "po_id" },
};

export const POST = withAuth(async (_req, ctx) => {
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);
  const callerId = ctx.user.id;
  const svc = ctx.svc;
  const deleted: Record<string, number> = {};

  // 1. Wipe tenant-scoped entered data (children before parents)
  for (const table of DELETE_TABLES) {
    const { data, error } = await svc.from(table).delete().eq("tenant_id", tenantId).select("id");
    if (error) {
      console.error(`[system/reset] delete ${table} failed:`, error.message);
      return err(`Failed to clear ${table}: ${error.message}`, 500);
    }
    deleted[table] = data?.length || 0;
  }

  // 2. Wipe child tables via parent ids (chat_presence has no id column — select *)
  for (const [child, { parent, column }] of Object.entries(CHILD_TABLES)) {
    const { data: parents } = await svc.from(parent).select("id").eq("tenant_id", tenantId);
    const parentIds = (parents || []).map((p: any) => p.id);
    let childDeleted = 0;
    for (let i = 0; i < parentIds.length; i += 100) {
      const { data, error } = await svc.from(child).delete().in(column, parentIds.slice(i, i + 100)).select("*");
      if (error) {
        console.error(`[system/reset] delete ${child} failed:`, error.message);
        return err(`Failed to clear ${child}: ${error.message}`, 500);
      }
      childDeleted += data?.length || 0;
    }
    deleted[child] = childDeleted;
  }

  // 3. Remove every user profile except the caller
  const { data: otherUsers, error: usersErr } = await svc
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .neq("id", callerId);
  if (usersErr) return err(usersErr.message, 500);

  const userIds = (otherUsers || []).map((u: any) => u.id);
  deleted.users = userIds.length;

  const { error: delUsersErr } = await svc.from("users").delete().neq("id", callerId).eq("tenant_id", tenantId);
  if (delUsersErr) return err(delUsersErr.message, 500);

  // 4. Sign out and delete the auth accounts (keeps the caller's login intact)
  let authDeleted = 0;
  for (const uid of userIds) {
    await svc.auth.admin.signOut(uid).catch(() => {});
    const { error } = await svc.auth.admin.deleteUser(uid);
    if (!error) authDeleted++;
  }
  deleted.auth_users = authDeleted;

  return ok({
    message:
      "System reset complete. All entered data has been cleared; your account and the system configuration (profile, catalogues, bank accounts, doctors, templates) are untouched.",
    deleted,
  });
});
