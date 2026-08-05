import { withAuth, requireTenant, ForbiddenError, ok, err, parseBody, ValidationError } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Full-system restore — hospital_admin / super_admin within a tenant scope.
// POST body: the JSON produced by GET /api/system/backup.
//
// Behavior:
//  - Wipes ALL existing tenant data (same table set as the backup, including
//    configuration tables) while keeping the calling admin's users row and
//    the tenant row itself so the session survives.
//  - Recreates Supabase Auth accounts for restored users whose auth account
//    no longer exists (temporary password — admin resets via Settings → Users).
//  - Users whose Supabase Auth account still exists keep their login
//    (same uid reused).
//  - analytics_daily is NOT restored (derived data): the analytics triggers
//    rebuild it from the restored patients/appointments/payments rows.

const WIPE_TABLES = [
  "branches",
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
  "drugs",
  "suppliers",
  "lab_tests",
  "wards",
  "hospital_bank_accounts",
  "landing_doctors",
  "notification_templates",
  "subscription_invoices",
];

const WIPE_CHILDREN: Record<string, { parent: string; column: string }> = {
  internal_message_recipients: { parent: "internal_messages", column: "message_id" },
  chat_messages: { parent: "chats", column: "chat_id" },
  chat_presence: { parent: "users", column: "user_id" },
  push_subscriptions: { parent: "users", column: "user_id" },
  prescription_items: { parent: "prescriptions", column: "prescription_id" },
  invoice_items: { parent: "invoices", column: "invoice_id" },
  lab_results: { parent: "lab_order_tests", column: "order_test_id" },
  lab_order_tests: { parent: "lab_orders", column: "order_id" },
  po_items: { parent: "purchase_orders", column: "po_id" },
  drug_batches: { parent: "drugs", column: "drug_id" },
  beds: { parent: "wards", column: "ward_id" },
};

// Column whitelist per restored table (excludes generated columns such as
// staff_leave.days and transient columns such as users.password_hash).
const T: Record<string, string[]> = {
  branches: ["id", "tenant_id", "name", "code", "address", "city", "state", "phone", "email", "is_main", "is_active", "created_at", "updated_at"],
  users: ["id", "tenant_id", "branch_id", "email", "full_name", "role", "phone", "avatar_url", "is_active", "last_login_at", "created_at", "updated_at"],
  staff: ["id", "tenant_id", "branch_id", "user_id", "staff_number", "department", "specialization", "license_number", "years_of_exp", "qualification", "employment_type", "base_salary", "is_available", "available_from", "available_until", "on_leave_until", "created_at", "updated_at"],
  patients: ["id", "tenant_id", "branch_id", "primary_branch_id", "user_id", "patient_number", "first_name", "last_name", "other_names", "gender", "date_of_birth", "phone", "email", "address", "city", "state", "blood_group", "genotype", "allergies", "chronic_conditions", "nhia_number", "insurance_provider", "insurance_plan", "next_of_kin", "is_insured", "marital_status", "medical_plan", "height_cm", "weight_kg", "emergency_contact_name", "emergency_contact_phone", "emergency_contact_rel", "is_primary_account", "primary_account_id", "dependant_relationship", "status", "created_at", "updated_at"],
  drugs: ["id", "tenant_id", "branch_id", "name", "generic_name", "sku", "category", "unit", "unit_price", "reorder_level", "requires_rx", "is_controlled", "nafdac_number", "is_active", "created_at", "updated_at"],
  drug_batches: ["id", "drug_id", "batch_number", "expiry_date", "quantity_on_hand", "cost_price", "received_at", "created_at", "updated_at"],
  suppliers: ["id", "tenant_id", "name", "contact", "phone", "email", "address", "nafdac_license", "is_active", "created_at", "updated_at"],
  wards: ["id", "tenant_id", "branch_id", "name", "ward_type", "is_active", "created_at", "updated_at"],
  beds: ["id", "ward_id", "bed_number", "status", "created_at", "updated_at"],
  lab_tests: ["id", "tenant_id", "name", "category", "price", "reference_range", "is_active", "created_at", "updated_at"],
  appointments: ["id", "tenant_id", "branch_id", "patient_id", "doctor_id", "scheduled_date", "start_time", "end_time", "type", "status", "reason", "notes", "reminder_sent", "created_by", "created_at", "updated_at"],
  visits: ["id", "tenant_id", "branch_id", "patient_id", "doctor_id", "appointment_id", "visit_type", "visit_date", "checked_in_at", "checked_out_at", "chief_complaint", "diagnosis", "notes", "follow_up_date", "created_at", "updated_at"],
  medical_records: ["id", "tenant_id", "patient_id", "visit_id", "created_by", "record_type", "title", "content", "attachments", "is_confidential", "created_at", "updated_at"],
  doctor_notes: ["id", "tenant_id", "patient_id", "doctor_id", "appointment_id", "visit_date", "vitals", "tests_procedures", "clinical_findings", "diagnosis", "medications", "treatment_recommendations", "next_visit_date", "next_visit_reason", "is_confidential", "created_by", "created_at", "updated_at"],
  medical_reports: ["id", "tenant_id", "patient_id", "reference_number", "report_date", "content", "author_name", "author_title", "created_by", "created_at"],
  prescriptions: ["id", "tenant_id", "branch_id", "patient_id", "doctor_id", "visit_id", "diagnosis", "notes", "status", "issued_date", "expires_date", "created_at", "updated_at"],
  prescription_items: ["id", "prescription_id", "drug_id", "medication_name", "dosage", "frequency", "route", "duration", "quantity", "refills", "dispensed_qty", "instructions", "created_at"],
  lab_orders: ["id", "tenant_id", "branch_id", "patient_id", "doctor_id", "visit_id", "status", "requested_at", "completed_at", "notes", "created_by", "created_at", "updated_at"],
  lab_order_tests: ["id", "order_id", "test_id", "test_name", "sample_type", "priority", "created_at"],
  lab_results: ["id", "order_test_id", "result", "unit", "is_abnormal", "uploaded_by", "result_file_url", "reported_at", "created_at", "updated_at"],
  invoices: ["id", "tenant_id", "branch_id", "patient_id", "invoice_number", "issue_date", "due_date", "status", "subtotal", "tax_amount", "discount_amount", "total_amount", "paid_amount", "insurance_claimable", "attending_staff_id", "notes", "created_by", "created_at", "updated_at"],
  invoice_items: ["id", "invoice_id", "description", "quantity", "unit_price", "vat_percent", "vat_amount", "total_price", "created_at"],
  payments: ["id", "tenant_id", "invoice_id", "patient_id", "amount", "payment_method", "status", "reference", "gateway", "metadata", "paid_by", "paid_at", "created_at", "updated_at"],
  expenses: ["id", "tenant_id", "branch_id", "description", "category", "amount", "expense_date", "payment_method", "vendor", "notes", "created_by", "created_at", "updated_at"],
  other_income: ["id", "tenant_id", "branch_id", "description", "category", "amount", "income_date", "payment_method", "source", "notes", "created_by", "created_at", "updated_at"],
  purchase_orders: ["id", "tenant_id", "branch_id", "supplier_id", "po_number", "order_date", "expected_by", "status", "total_amount", "notes", "created_by", "created_at", "updated_at"],
  po_items: ["id", "po_id", "drug_id", "item_name", "quantity_ordered", "quantity_received", "unit_cost", "total_cost", "created_at"],
  goods_receipts: ["id", "tenant_id", "po_id", "grn_number", "received_at", "received_by", "notes", "created_at"],
  requisitions: ["id", "tenant_id", "branch_id", "requested_by", "item", "quantity", "remarks", "status", "approved_by", "issued_at", "created_at", "updated_at"],
  stock_movements: ["id", "tenant_id", "drug_id", "batch_id", "type", "quantity", "source_ref", "created_by", "created_at"],
  admissions: ["id", "tenant_id", "branch_id", "patient_id", "visit_id", "bed_id", "admitted_at", "discharged_at", "expected_discharge", "admitting_doctor", "status", "diagnosis_at_admission", "notes", "created_by", "created_at", "updated_at"],
  staff_roster: ["id", "tenant_id", "branch_id", "user_id", "shift_date", "shift_start", "shift_end", "shift_type", "notes", "created_at"],
  attendance: ["id", "tenant_id", "branch_id", "user_id", "work_date", "check_in", "check_out", "status", "notes", "created_at", "updated_at"],
  staff_leave: ["id", "tenant_id", "user_id", "leave_type", "start_date", "end_date", "reason", "status", "approved_by", "created_at"],
  duty_roster: ["id", "tenant_id", "staff_id", "user_id", "shift_date", "from_time", "until_time", "note", "created_by", "created_at"],
  notifications: ["id", "tenant_id", "user_id", "patient_id", "channel", "event", "title", "message", "reference_type", "reference_id", "is_read", "status", "sent_at", "created_at"],
  chats: ["id", "tenant_id", "patient_id", "staff_user_id", "last_message", "last_sender_id", "last_message_at", "created_at", "updated_at"],
  chat_messages: ["id", "chat_id", "sender_id", "message", "is_read", "created_at"],
  internal_messages: ["id", "tenant_id", "sender_id", "subject", "body", "is_broadcast", "broadcast_scope", "created_at"],
  internal_message_recipients: ["id", "message_id", "recipient_id", "is_read", "read_at", "created_at"],
  hospital_bank_accounts: ["id", "tenant_id", "bank_name", "account_name", "account_number", "is_active", "created_at", "updated_at"],
  landing_doctors: ["id", "tenant_id", "name", "specialty", "available", "availability", "image_url", "sort_order", "is_active", "created_at", "updated_at"],
  notification_templates: ["id", "tenant_id", "channel", "event", "subject", "body", "is_active", "created_at", "updated_at"],
  subscription_invoices: ["id", "tenant_id", "period_start", "period_end", "amount", "currency", "status", "provider", "provider_ref", "created_at", "updated_at"],
  audit_logs: ["id", "tenant_id", "user_id", "role", "action", "entity_type", "entity_id", "changes", "description", "ip_address", "user_agent", "created_at"],
  security_events: ["id", "tenant_id", "user_id", "event_type", "severity", "description", "ip_address", "user_agent", "metadata", "created_at"],
};

// FK remap: table -> { column: targetTable }. Values are remapped through the
// backup→live id map built as rows are inserted (parent tables come first).
const REMAP: Record<string, Record<string, string>> = {
  users: { branch_id: "branches" },
  staff: { user_id: "users", branch_id: "branches" },
  patients: { user_id: "users", primary_account_id: "patients", branch_id: "branches", primary_branch_id: "branches" },
  drug_batches: { drug_id: "drugs" },
  beds: { ward_id: "wards" },
  appointments: { patient_id: "patients", doctor_id: "users", branch_id: "branches", created_by: "users" },
  visits: { patient_id: "patients", doctor_id: "users", appointment_id: "appointments", branch_id: "branches" },
  medical_records: { patient_id: "patients", visit_id: "visits", created_by: "users" },
  doctor_notes: { patient_id: "patients", doctor_id: "users", appointment_id: "appointments", created_by: "users" },
  medical_reports: { patient_id: "patients", created_by: "users" },
  prescriptions: { patient_id: "patients", doctor_id: "users", visit_id: "visits", branch_id: "branches" },
  prescription_items: { prescription_id: "prescriptions", drug_id: "drugs" },
  lab_orders: { patient_id: "patients", doctor_id: "users", visit_id: "visits", branch_id: "branches", created_by: "users" },
  lab_order_tests: { order_id: "lab_orders", test_id: "lab_tests" },
  lab_results: { order_test_id: "lab_order_tests", uploaded_by: "users" },
  invoices: { patient_id: "patients", attending_staff_id: "users", branch_id: "branches", created_by: "users" },
  invoice_items: { invoice_id: "invoices" },
  payments: { invoice_id: "invoices", patient_id: "patients", paid_by: "users" },
  expenses: { branch_id: "branches", created_by: "users" },
  other_income: { branch_id: "branches", created_by: "users" },
  purchase_orders: { supplier_id: "suppliers", branch_id: "branches", created_by: "users" },
  po_items: { po_id: "purchase_orders", drug_id: "drugs" },
  goods_receipts: { po_id: "purchase_orders", received_by: "users" },
  requisitions: { branch_id: "branches", requested_by: "users", approved_by: "users" },
  stock_movements: { drug_id: "drugs", batch_id: "drug_batches", created_by: "users" },
  admissions: { patient_id: "patients", visit_id: "visits", bed_id: "beds", admitting_doctor: "users", branch_id: "branches", created_by: "users" },
  staff_roster: { user_id: "users", branch_id: "branches" },
  attendance: { user_id: "users", branch_id: "branches" },
  staff_leave: { user_id: "users", approved_by: "users" },
  duty_roster: { staff_id: "staff", user_id: "users", created_by: "users" },
  notifications: { user_id: "users", patient_id: "patients" },
  chats: { patient_id: "patients", staff_user_id: "users", last_sender_id: "users" },
  chat_messages: { chat_id: "chats", sender_id: "users" },
  internal_messages: { sender_id: "users" },
  internal_message_recipients: { message_id: "internal_messages", recipient_id: "users" },
  audit_logs: { user_id: "users" },
  security_events: { user_id: "users" },
};

// Insert order — FK dependency (parents before children).
const ORDER = [
  "branches",
  "users",
  "staff",
  "patients",
  "drugs",
  "drug_batches",
  "suppliers",
  "wards",
  "beds",
  "lab_tests",
  "appointments",
  "visits",
  "medical_records",
  "doctor_notes",
  "medical_reports",
  "prescriptions",
  "prescription_items",
  "lab_orders",
  "lab_order_tests",
  "lab_results",
  "invoices",
  "invoice_items",
  "payments",
  "expenses",
  "other_income",
  "purchase_orders",
  "po_items",
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
  "chat_messages",
  "internal_messages",
  "internal_message_recipients",
  "hospital_bank_accounts",
  "landing_doctors",
  "notification_templates",
  "subscription_invoices",
  "audit_logs",
  "security_events",
];

function pick(row: any, cols: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const c of cols) {
    if (row && row[c] !== undefined) out[c] = row[c];
  }
  return out;
}

function randomTempPassword(): string {
  return `SC-${crypto.randomUUID().slice(0, 10)}!a1`;
}

export const POST = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const tenantId = requireTenant(ctx);
  const callerId = ctx.user.id;
  const svc = ctx.svc;

  const body = await parseBody<any>(req);
  if (!body || body.version !== 1 || !body.tables || typeof body.tables !== "object") {
    throw new ValidationError("Invalid backup file — expected a version 1 backup JSON");
  }
  const tables = body.tables;
  for (const t of ORDER) {
    if (tables[t] === undefined) tables[t] = [];
  }

  // ── 1. Wipe existing tenant data (keep the caller's users row + tenant row) ──
  const wipeCounts: Record<string, number> = {};
  for (const table of WIPE_TABLES) {
    const { data, error } = await svc.from(table).delete().eq("tenant_id", tenantId).select("id");
    if (error) {
      return err(`Failed to wipe ${table}: ${error.message}`, 500);
    }
    wipeCounts[table] = data?.length || 0;
  }
  for (const [child, { parent, column }] of Object.entries(WIPE_CHILDREN)) {
    const { data: parents } = await svc.from(parent).select("id").eq("tenant_id", tenantId);
    const parentIds = (parents || []).map((p: any) => p.id);
    let n = 0;
    for (let i = 0; i < parentIds.length; i += 100) {
      const { data, error } = await svc.from(child).delete().in(column, parentIds.slice(i, i + 100)).select("*");
      if (error) return err(`Failed to wipe ${child}: ${error.message}`, 500);
      n += data?.length || 0;
    }
    wipeCounts[child] = n;
  }
  const { data: otherUsers } = await svc.from("users").select("id").eq("tenant_id", tenantId).neq("id", callerId);
  const wipeUserIds = (otherUsers || []).map((u: any) => u.id);
  wipeCounts.users = wipeUserIds.length;
  const { error: delUsersErr } = await svc.from("users").delete().eq("tenant_id", tenantId).neq("id", callerId);
  if (delUsersErr) return err(`Failed to wipe users: ${delUsersErr.message}`, 500);

  // ── 2. Restore the tenant row itself (safe subset — identity kept) ──
  if (body.tenant && typeof body.tenant === "object") {
    const tenantPick = pick(body.tenant, [
      "name", "email", "phone", "address", "city", "state", "country",
      "logo_url", "brand_color", "currency", "timezone", "settings", "website",
    ]);
    await svc.from("tenants").update(tenantPick).eq("id", tenantId);
  }

  // ── 3. Insert branches first (users.branch_id depends on them) ──
  const idMap = new Map<string, string>(); // backup id -> live id (all tables)
  let branchCount = 0;
  for (const b of tables.branches || []) {
    const row = pick(b, T.branches);
    row.tenant_id = tenantId;
    const { data, error } = await svc.from("branches").insert(row).select("id").single();
    if (error) return err(`Failed to restore branch ${b.name}: ${error.message}`, 500);
    idMap.set(b.id, data.id);
    branchCount++;
  }

  // ── 4. Recreate user accounts (auth) ──
  let createdAccounts = 0;
  let reusedAccounts = 0;

  for (const u of tables.users || []) {
    const backupId = u.id;
    let liveId: string | null = null;

    if (backupId === callerId) {
      liveId = callerId;
      reusedAccounts++;
    } else {
      const { data: existing } = await svc.auth.admin.getUserById(backupId).catch(() => ({ data: null }));
      if (existing?.user) {
        liveId = backupId;
        reusedAccounts++;
      } else {
        const { data: created, error: createErr } = await svc.auth.admin.createUser({
          email: u.email,
          password: randomTempPassword(),
          email_confirm: true,
          app_metadata: {
            role: u.role ?? "hospital_admin",
            tenant_id: tenantId,
            branch_id: u.branch_id ?? null,
          },
          user_metadata: { full_name: u.full_name ?? u.email },
        });
        if (createErr) {
          // Duplicate email elsewhere — reuse that auth account instead
          const { data: page } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const match = (page?.users || []).find((x: any) => x.email?.toLowerCase() === (u.email || "").toLowerCase());
          if (match) {
            liveId = match.id;
            reusedAccounts++;
          } else {
            return err(`Failed to restore account ${u.email}: ${createErr.message}`, 500);
          }
        } else {
          liveId = created?.user?.id ?? null;
          if (liveId) createdAccounts++;
        }
      }
    }

    if (liveId) idMap.set(backupId, liveId);
  }

  const remapValue = (v: any, targetMap: string | undefined): any => {
    if (targetMap === undefined || v == null) return v;
    const map = idMap.get(String(v));
    return map || v; // keep original if unmapped (orphan-safe)
  };

  // ── 5. Insert users rows ──
  const userRows = (tables.users || [])
    .filter((u: any) => idMap.has(u.id))
    .map((u: any) => {
      const row = pick(u, T.users);
      row.id = idMap.get(u.id);
      row.tenant_id = tenantId;
      row.branch_id = remapValue(row.branch_id, "branches");
      return row;
    });
  for (const row of userRows) {
    if (row.id === callerId) {
      const upd = { ...row };
      delete upd.id;
      delete upd.tenant_id;
      delete upd.created_at;
      const { error } = await svc.from("users").update(upd).eq("id", callerId);
      if (error) return err(`Failed to restore caller profile: ${error.message}`, 500);
    } else {
      const { error } = await svc.from("users").insert(row);
      if (error) return err(`Failed to restore user ${row.email || row.id}: ${error.message}`, 500);
    }
  }
  const restoredCounts: Record<string, number> = { users: userRows.length };
  for (const table of ORDER) {
    if (table === "users" || table === "branches") continue;
    const rows = tables[table] || [];
    if (rows.length === 0) continue;
    const cols = T[table];
    const remaps = REMAP[table] || {};
    const clean = rows.map((r: any) => {
      const row = pick(r, cols);
      if (cols.includes("tenant_id")) row.tenant_id = tenantId;
      for (const [col, target] of Object.entries(remaps)) {
        row[col] = remapValue(row[col], target);
      }
      return row;
    });
    for (let i = 0; i < clean.length; i += 500) {
      const chunk = clean.slice(i, i + 500);
      const { error } = await svc.from(table).insert(chunk);
      if (error) return err(`Failed to restore ${table}: ${error.message}`, 500);
    }
    restoredCounts[table] = clean.length;
  }
  restoredCounts.branches = branchCount;

  return ok({
    wiped: wipeCounts,
    restored: restoredCounts,
    users: {
      createdAccounts,
      reusedAccounts,
      note: "Restored accounts that had to be recreated use a temporary password — reset them from Settings → Users.",
    },
  });
});
