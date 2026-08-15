import {
  withAuth,
  ok,
  ValidationError,
  ForbiddenError,
  NotFoundError,
  requireTenant,
  isAdminRole,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { createPortalAccount, generateTempPassword } from "@/lib/dependant-portal";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/patients/[id]/provision-portal — hospital admins give a login-less
// PRIMARY patient their own portal account (auth user + users mirror row). Mirrors
// the dependant provision-portal flow; the account is linked to patients.user_id.
export const POST = withAuth(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (!isAdminRole(ctx.role)) {
    throw new ForbiddenError("Only hospital admins can provision portal accounts");
  }

  const segs = req.nextUrl.pathname.split("/").filter(Boolean);
  const id = segs[segs.length - 2]!;
  const body = (await req.json().catch(() => ({}))) as { forceReset?: boolean };

  const { data: patient, error } = await ctx.svc
    .from("patients")
    .select("id, patient_number, first_name, last_name, email, phone, user_id, status, is_primary_account")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new ValidationError(error.message);
  if (!patient) throw new NotFoundError("Patient not found");
  if (!patient.is_primary_account) {
    throw new ValidationError("Only primary patients can be provisioned here — use the dependant flow instead");
  }
  if (patient.status !== "active") {
    throw new ValidationError("Cannot provision a portal login for a non-active patient");
  }

  const provisioned: Record<string, unknown>[] = [];
  const skipped: Array<{ patientId: string; reason: string }> = [];

  if (patient.user_id && !body.forceReset) {
    skipped.push({ patientId: patient.id, reason: "already has a portal account" });
    return ok({ provisioned, skipped });
  }
  if (!patient.email?.trim()) {
    skipped.push({ patientId: patient.id, reason: "no email on file" });
    return ok({ provisioned, skipped });
  }

  try {
    let userId = patient.user_id as string | null;
    let tempPassword: string | null = null;
    if (userId) {
      tempPassword = generateTempPassword();
      const { error: resetErr } = await ctx.svc.auth.admin.updateUserById(userId, {
        password: tempPassword,
      });
      if (resetErr) {
        return ok({
          provisioned,
          skipped: [{ patientId: patient.id, reason: resetErr.message ?? "failed to reset password" }],
        });
      }
    } else {
      const res = await createPortalAccount(ctx.svc, {
        email: patient.email.trim().toLowerCase(),
        fullName: `${patient.first_name} ${patient.last_name}`.trim(),
        tenantId,
        branchId: ctx.branchId ?? null,
        phone: patient.phone ?? null,
      });
      userId = res.userId;
      tempPassword = res.tempPassword;
    }
    const { error: linkErr } = await ctx.svc
      .from("patients")
      .update({ user_id: userId })
      .eq("id", patient.id)
      .eq("tenant_id", tenantId);
    if (linkErr) {
      if (!patient.user_id) {
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
      return ok({
        provisioned,
        skipped: [{ patientId: patient.id, reason: linkErr.message }],
      });
    }
    provisioned.push({
      patientId: patient.id,
      patientNumber: patient.patient_number,
      firstName: patient.first_name,
      lastName: patient.last_name,
      email: patient.email.trim().toLowerCase(),
      tempPassword,
    });
  } catch (e) {
    skipped.push({
      patientId: patient.id,
      reason: e instanceof Error ? e.message : "failed to create account",
    });
  }

  if (provisioned.length > 0) {
    await logAudit(req, ctx, {
      action: "create",
      entityType: "users",
      entityId: patient.id,
      description: `Provisioned portal login for primary patient ${patient.patient_number}`,
    });
  }

  return ok({ provisioned, skipped });
});

export const runtime = "nodejs";
