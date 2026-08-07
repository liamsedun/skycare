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
      const ctx: AuthedContext = {
        user,
        claims,
        tenantId: claims.tenantId,
        branchId: claims.branchId,
        role,
        supabase,
        svc,
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
