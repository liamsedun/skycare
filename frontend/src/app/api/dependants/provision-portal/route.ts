import {
  withAuth,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
  isAdminRole,
} from "@/lib/api-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/dependants/provision-portal — DISABLED
// Family account model: dependants do NOT get their own portal login.
// All family members access the portal through the primary account holder's login.
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isAdminRole(ctx.role)) {
    throw new ForbiddenError("Only hospital admins can manage portal accounts");
  }

  throw new ValidationError(
    "Dependants no longer receive individual portal logins. " +
    "All family members access the portal through the primary account holder's login. " +
    "To give a patient portal access, create a login on the primary patient's record instead."
  );
});

export const runtime = "nodejs";