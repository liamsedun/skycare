import { withAuth, okPaginated, ok, ValidationError, ForbiddenError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { getPagination, resolveParam } from "@/lib/api-utils";
import type { NextRequest } from "next/server";
import type { StaffRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Roles a hospital_admin may grant within their own tenant.
export const GRANTABLE_ROLES: StaffRole[] = [
  "hospital_admin",
  "doctor",
  "nurse",
  "pharmacist",
  "lab_tech",
  "cashier",
  "receptionist",
  "medical_officer",
  "surgeon",
  "anesthesiologist",
  "radiologist",
  "radiographer",
  "physiotherapist",
  "dentist",
  "optometrist",
  "dietician",
  "medical_records",
  "accountant",
  "hr_officer",
  "it_support",
  "security",
  "ward_orderly",
  "hmo_officer",
  "paramedic",
];

// GET /api/admin/users?role=&search=&is_active=&page=&pageSize=
export const GET = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const { page, pageSize, from, to } = getPagination(req.nextUrl.searchParams);
  const role = resolveParam(req.nextUrl.searchParams.get("role"));
  const search = resolveParam(req.nextUrl.searchParams.get("search"))?.trim();
  const isActive = resolveParam(req.nextUrl.searchParams.get("is_active"));

  // super_admin is platform-wide (tenant NULL) — list all staff; hospital_admin is tenant-scoped.
  let query = ctx.svc
    .from("users")
    .select(
      "id, tenant_id, branch_id, email, full_name, role, phone, avatar_url, is_active, last_login_at, created_at, staff(id, staff_number, department, specialization, license_number, qualification, employment_type, years_of_exp, base_salary, is_available, on_leave_until)",
      { count: "exact" }
    )
    .neq("role", "patient_api")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (ctx.tenantId) query = query.eq("tenant_id", ctx.tenantId);

  if (role) query = query.eq("role", role);
  if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  if (isActive === "true") query = query.eq("is_active", true);
  if (isActive === "false") query = query.eq("is_active", false);

  const { data, count } = await query;
  return okPaginated(data ?? [], count ?? 0, page, pageSize);
});

export interface CreateUserBody {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  role: StaffRole;
  department?: string;
  specialization?: string;
  staffNumber?: string;
}

// POST /api/admin/users — create an admin/staff login with direct credentials.
// hospital_admin creates tenant-scoped accounts; super_admin may also create
// platform super_admin accounts (tenant_id NULL).
export const POST = withAuth(async (req, ctx) => {
  if (ctx.role !== "hospital_admin" && ctx.role !== "super_admin") {
    throw new ForbiddenError("Admin access required");
  }
  const body = (await req.json()) as CreateUserBody;

  if (!body.fullName?.trim() || !body.email?.trim()) {
    throw new ValidationError("Full name and email are required");
  }
  const creatingSuperAdmin = body.role === "super_admin";
  if (creatingSuperAdmin && ctx.role !== "super_admin") {
    throw new ForbiddenError("Only the Super Admin can create platform admins");
  }
  if (!GRANTABLE_ROLES.includes(body.role) && !creatingSuperAdmin) {
    throw new ValidationError("Cannot create accounts with that role");
  }
  if (!body.password || body.password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
  }

  const tenantId = creatingSuperAdmin ? null : requireTenant(ctx);
  const branchId = creatingSuperAdmin ? null : ctx.branchId ?? null;
  const email = body.email.trim().toLowerCase();
  const { data: existing } = await ctx.svc
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) throw new ValidationError("A user with this email already exists");

  const { data: authUser, error: authError } = await ctx.svc.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    app_metadata: {
      role: body.role,
      tenant_id: tenantId,
      branch_id: branchId,
    },
    user_metadata: { full_name: body.fullName.trim() },
  });
  if (authError || !authUser?.user) {
    throw new ValidationError(authError?.message ?? "Failed to create user account");
  }

  const { data: userRow, error: userError } = await ctx.svc
    .from("users")
    .insert({
      id: authUser.user.id,
      tenant_id: tenantId,
      branch_id: branchId,
      email,
      full_name: body.fullName.trim(),
      role: body.role,
      phone: body.phone?.trim() || null,
      is_active: true,
    })
    .select()
    .single();
  if (userError) {
    await ctx.svc.auth.admin.deleteUser(authUser.user.id);
    throw new ValidationError("Failed to save user profile");
  }

  // Staff rows give clinical/support staff roster, leave, and availability.
  const clinical = ["doctor", "nurse", "pharmacist", "lab_tech", "cashier", "receptionist",
    "medical_officer", "surgeon", "anesthesiologist", "radiologist", "radiographer",
    "physiotherapist", "dentist", "optometrist", "dietician", "medical_records",
    "accountant", "hr_officer", "it_support", "security", "ward_orderly", "hmo_officer", "paramedic"];
  let staff = null;
  if (clinical.includes(body.role)) {
    const { data: staffRow } = await ctx.svc
      .from("staff")
      .insert({
        tenant_id: tenantId!,
        branch_id: branchId,
        user_id: authUser.user.id,
        staff_number: body.staffNumber?.trim() || (await generateStaffNumber(ctx.svc, tenantId!)),
        department: body.department?.trim() || null,
        specialization: body.specialization?.trim() || null,
      })
      .select()
      .single();
    staff = staffRow;
  }

  await logAudit(req, ctx, {
    action: "create",
    entityType: "users",
    entityId: authUser.user.id,
    description: `Created ${body.role} account for ${email}`,
  });

  return ok({ user: userRow, staff });
});

export const runtime = "nodejs";

async function generateStaffNumber(svc: any, tenantId: string): Promise<string> {
  const { count } = await svc
    .from("staff")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  return `STF-${String((count ?? 0) + 1).padStart(4, "0")}`;
}
