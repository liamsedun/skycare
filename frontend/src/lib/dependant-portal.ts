import { randomBytes } from "node:crypto";

export function generateTempPassword(): string {
  return `Dp!${randomBytes(6).toString("hex")}`;
}

interface PortalAccountInput {
  email: string;
  fullName: string;
  tenantId: string;
  branchId: string | null;
  phone?: string | null;
  password?: string;
}

// Creates a patient_portal-style account (auth user + users mirror row).
// Throws with a human message on failure; the auth user is rolled back if the
// users-mirror insert fails. Returns the account id + (temp) password used.
export async function createPortalAccount(
  svc: any,
  input: PortalAccountInput
): Promise<{ userId: string; tempPassword: string }> {
  const tempPassword = input.password ?? generateTempPassword();
  const { data: authUser, error: authError } = await svc.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
    app_metadata: {
      role: "patient_api",
      tenant_id: input.tenantId,
      branch_id: input.branchId ?? null,
    },
    user_metadata: { full_name: input.fullName },
  });
  if (authError || !authUser?.user) {
    throw new Error(authError?.message ?? "Failed to create portal account");
  }
  const userId = authUser.user.id;
  const { error: userError } = await svc.from("users").insert({
    id: userId,
    tenant_id: input.tenantId,
    branch_id: input.branchId ?? null,
    email: input.email,
    full_name: input.fullName,
    role: "patient_api",
    phone: input.phone?.trim() || null,
    is_active: true,
  });
  if (userError) {
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(userError.message);
  }
  return { userId, tempPassword };
}

// Syncs a portal account's email to the auth user AND the users mirror row.
// Email is authoritative in auth: update it there FIRST so a duplicate address
// fails before anything else is touched. Throws with a human message on failure.
export async function syncPortalAccountEmail(svc: any, userId: string, email: string): Promise<void> {
  const em = String(email).trim().toLowerCase();
  const { error: authError } = await svc.auth.admin.updateUserById(userId, {
    email: em,
    email_confirm: true,
  });
  if (authError) throw new Error(authError.message);
  const { error: mirrorError } = await svc.from("users").update({ email: em }).eq("id", userId);
  if (mirrorError) throw new Error(mirrorError.message);
}