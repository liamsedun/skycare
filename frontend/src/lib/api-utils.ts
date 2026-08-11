import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getClaims, isAppRole, isStaffRole, STAFF_ROLES, type AppRole, type AuthClaims } from "@/lib/auth";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// ============================================================================
// API UTILITIES — SkyCare multi-tenant adaptation.
// Every authed handler receives { user, claims, tenantId, role, supabase, svc }.
// Isolation contract: when tenantId is present, ALL service-client queries MUST
// filter by tenant_id = tenantId. super_admin (tenantId null) is platform-wide.
// ============================================================================

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export class AuthError extends ApiError {
  constructor(message = "Not authenticated") {
    super(message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Invalid request") {
    super(message, 400);
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function okPaginated<T>(
  data: T,
  total: number,
  page: number,
  pageSize: number
) {
  return NextResponse.json(
    {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
      },
    },
    { status: 200 }
  );
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function parseBody<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}

export function getPagination(searchParams: URLSearchParams) {
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawSize = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(Math.floor(rawSize), 100) : 20;
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

export function resolveParam(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Sanitize a free-text search term before embedding it in a PostgREST
 * `or(...)` ILIKE filter. PostgREST parses the or-expression by scanning for
 * parenthesis and comma separators, so a value like "Bisoprolol (Sandoz) 5mg"
 * would terminate the expression early at the closing paren and silently
 * return ZERO rows. Replacing those characters with the LIKE wildcard turns
 * the term back into a match ("Bisoprolol %Sandoz% 5mg" matches
 * "Bisoprolol (Sandoz) 5mg Tablets x28") while keeping fuzzy matching.
 */
export function sanitizeLike(term: string): string {
  return term.replace(/[(),]/g, "%");
}

// ---------------------------------------------------------------------------
// BANKING LEDGER (automated posting helpers)
// ---------------------------------------------------------------------------

/**
 * Resolve the default bank account for a tenant: the first active account,
 * mirroring the pharmacy payment flow (0061). Returns null when the admin
 * has not added any active bank in Settings.
 */
export async function resolveBankAccountId(
  svc: SupabaseClient,
  tenantId: string
): Promise<string | null> {
  const { data } = await svc
    .from("hospital_bank_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Cash vs bank for an incoming/outgoing payment method. Raw banks → Cash, anything else → bank. */
export function bankLedgerAccountForMethod(
  method: string | null | undefined,
  bankAccountId: string | null
): string | null {
  const m = (method ?? "").toLowerCase();
  return m === "cash" ? null : bankAccountId;
}

export interface PostBankLedgerInput {
  tenantId: string;
  branchId?: string | null;
  accountId?: string | null;
  direction: "in" | "out";
  amount: number;
  source: "payment" | "other_income" | "expense" | "adjustment";
  sourceRef?: string | null;
  paymentId?: string | null;
  incomeId?: string | null;
  expenseId?: string | null;
  method?: string | null;
  reference?: string | null;
  notes?: string | null;
  recordedAt?: string | null;
  createdBy?: string | null;
}

/**
 * Insert one Banking ledger row (service client). account_id NULL = Cash.
 * Callers pass a resolved accountId — use resolveBankAccountId() +
 * bankLedgerAccountForMethod() to derive it.
 */
export async function postBankLedger(
  svc: SupabaseClient,
  input: PostBankLedgerInput
): Promise<void> {
  await svc.from("hospital_bank_ledger").insert({
    tenant_id: input.tenantId,
    branch_id: input.branchId ?? null,
    account_id: input.accountId ?? null,
    direction: input.direction,
    amount: input.amount,
    source: input.source,
    source_ref: input.sourceRef ?? null,
    payment_id: input.paymentId ?? null,
    income_id: input.incomeId ?? null,
    expense_id: input.expenseId ?? null,
    method: input.method ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    recorded_at: input.recordedAt ?? new Date().toISOString(),
    created_by: input.createdBy ?? null,
  });
}

// ---------------------------------------------------------------------------
// AUTH CONTEXT
// ---------------------------------------------------------------------------
export interface AuthedContext {
  user: User;
  claims: AuthClaims;
  tenantId: string | null;
  branchId: string | null;
  role: AppRole;
  supabase: SupabaseClient;
  svc: SupabaseClient;
  /**
   * Per-user module access level for a nav key ("full" | "view_only" | "none").
   * Lazy: loads users.module_access on first call, cached per request.
   * No module_access record -> "full" (role defaults apply).
   */
  accessLevel: (key: string) => Promise<"full" | "view_only" | "none">;
}

export type ApiHandler = (
  req: NextRequest,
  ctx: AuthedContext
) => Promise<NextResponse<unknown>> | NextResponse<unknown>;

/**
 * Wraps a route handler with authentication + optional role gate.
 * Role checks run against JWT app_metadata claims (fast path; the claims are
 * written by tenant-onboarding / admin user management and kept authoritative).
 */
export function withAuth(
  handler: ApiHandler,
  opts?: { roles?: AppRole[] }
) {
  return async (req: NextRequest) => {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new AuthError();

      const claims = getClaims(user);
      const role = claims.role;
      if (!role || !isAppRole(role)) throw new ForbiddenError("Invalid account role");

      if (opts?.roles && !opts.roles.includes(role)) {
        throw new ForbiddenError("You do not have permission to perform this action");
      }

      // Staff routes must never accept patient_api; patient routes must never accept staff.
      if (opts?.roles) {
        const allowedStaff = opts.roles.some((r) => isStaffRole(r));
        const allowedPatient = opts.roles.includes("patient_api");
        if (!allowedPatient && role === "patient_api") {
          throw new ForbiddenError("Staff portal access only");
        }
        if (!allowedStaff && role !== "patient_api") {
          throw new ForbiddenError("Patient portal access only");
        }
      }

      const svc = createServiceClient();

      // Lazy per-request module access cache (users.module_access jsonb map).
      let accessCache: Record<string, "full" | "view_only" | "none"> | null | undefined;
      const accessLevel = async (key: string): Promise<"full" | "view_only" | "none"> => {
        if (accessCache === undefined) {
          const { data } = await supabase
            .from("users")
            .select("module_access")
            .eq("id", user.id)
            .maybeSingle();
          accessCache = data?.module_access ?? null;
        }
        const level = accessCache?.[key];
        return level ?? (accessCache ? "none" : "full");
      };

      const ctx: AuthedContext = {
        user,
        claims,
        tenantId: claims.tenantId,
        branchId: claims.branchId,
        role,
        supabase,
        svc,
        accessLevel,
      };
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return err(e.message, e.status);
      console.error("[api]", e);
      return err("Something went wrong", 500);
    }
  };
}

/** Require a signed-in staff member (any staff role, incl. extended roster roles). */
export function withStaff(handler: ApiHandler) {
  return withAuth(handler, { roles: [...STAFF_ROLES] });
}

/** Require a staff member AND explicit tenant scoping is mandatory. */
export function requireTenant(ctx: AuthedContext): string {
  if (!ctx.tenantId) {
    throw new ForbiddenError("This operation requires a hospital (tenant) scope");
  }
  return ctx.tenantId;
}

// ---------------------------------------------------------------------------
// ROLE HELPERS (SkyCare role vocabulary)
// ---------------------------------------------------------------------------
export const BILLING_ROLES: AppRole[] = ["hospital_admin", "cashier", "super_admin"];
export const CLINICAL_ROLES: AppRole[] = ["hospital_admin", "doctor", "nurse", "super_admin"];
export const ADMIN_ROLES: AppRole[] = ["hospital_admin", "super_admin"];

export function isAdminRole(role: AppRole | undefined): boolean {
  return role === "hospital_admin" || role === "super_admin";
}

// ---------------------------------------------------------------------------
// MODULE ACCESS GUARDS
// ---------------------------------------------------------------------------

/** Require the caller to have at least the given level on a module. */
export async function requireModuleLevel(
  ctx: AuthedContext,
  key: string,
  min: "full" | "view_only" = "view_only"
): Promise<void> {
  const level = await ctx.accessLevel(key);
  if (level === "none") throw new ForbiddenError("You do not have access to this module");
  if (min === "full" && level !== "full") {
    throw new ForbiddenError("View-only access — this action requires full access");
  }
}
