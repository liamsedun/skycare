import {
  withAuth,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
  isAdminRole,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createPortalAccount, generateTempPassword } from "@/lib/dependant-portal";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/dependants/provision-portal — hospital admins create portal logins
// for dependants that have an email but no account yet. Omitting `patientIds`
// provisions every login-less dependant in the tenant.
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isAdminRole(ctx.role)) {
    throw new ForbiddenError("Only hospital admins can provision portal accounts");
  }

  const body = (await req.json().catch(() => ({}))) as { patientIds?: string[]; forceReset?: boolean };
  let query = ctx.svc
    .from("patients")
    .select("id, patient_number, first_name, last_name, email, phone, primary_account_id, user_id")
    .eq("tenant_id", tenantId)
    .eq("is_primary_account", false);
  if (Array.isArray(body.patientIds) && body.patientIds.length > 0) {
    query = query.in("id", [...new Set(body.patientIds)].slice(0, 200));
  }
  const { data: deps, error } = await query;
  if (error) throw new ValidationError(error.message);

  const provisioned: Array<Record<string, unknown>> = [];
  const skipped: Array<{ patientId: string; reason: string }> = [];

  for (const d of deps ?? []) {
    if (d.user_id && !body.forceReset) {
      skipped.push({ patientId: d.id, reason: "already has a portal account" });
      continue;
    }
    if (!d.email?.trim()) {
      skipped.push({ patientId: d.id, reason: "no email on file" });
      continue;
    }
    try {
      let userId = d.user_id as string | null;
      let tempPassword: string | null = null;
      if (userId) {
        // Force reset: keep the existing account, just roll a new password.
        tempPassword = generateTempPassword();
        const { error: resetErr } = await ctx.svc.auth.admin.updateUserById(userId, {
          password: tempPassword,
        });
        if (resetErr) {
          skipped.push({ patientId: d.id, reason: resetErr.message ?? "failed to reset password" });
          continue;
        }
      } else {
        const res = await createPortalAccount(ctx.svc, {
          email: d.email.trim().toLowerCase(),
          fullName: `${d.first_name} ${d.last_name}`.trim(),
          tenantId,
          branchId: ctx.branchId ?? null,
          phone: d.phone ?? null,
        });
        userId = res.userId;
        tempPassword = res.tempPassword;
      }
      const { error: linkErr } = await ctx.svc
        .from("patients")
        .update({ user_id: userId })
        .eq("id", d.id)
        .eq("tenant_id", tenantId);
      if (linkErr) {
        if (!d.user_id) {
          await ctx.svc.auth.admin.deleteUser(userId).catch(() => {});
          await ctx.svc
            .from("users")
            .delete()
            .eq("id", userId)
            .then(
              () => {},
              () => {}
            );
        }
        skipped.push({ patientId: d.id, reason: linkErr.message });
        continue;
      }
      provisioned.push({
        patientId: d.id,
        patientNumber: d.patient_number,
        firstName: d.first_name,
        lastName: d.last_name,
        email: d.email.trim().toLowerCase(),
        tempPassword,
      });
    } catch (e) {
      skipped.push({
        patientId: d.id,
        reason: e instanceof Error ? e.message : "failed to create account",
      });
    }
  }

  if (provisioned.length > 0) {
    await logAudit(req, ctx, {
      action: "create",
      entityType: "users",
      entityId: `bulk/${provisioned.length}/${skipped.length}`,
      description: `Provisioned portal logins for ${provisioned.length} dependant(s)`,
    });
  }

  return ok({ provisioned, skipped });
});

export const runtime = "nodejs";