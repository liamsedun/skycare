import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/uploads/tenant-logo — upload a hospital logo to the public avatars bucket
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Only admins can upload a hospital logo");
  }

  const formData = await req.formData();
  const file = formData.get("logo");
  if (!(file instanceof File)) throw new ValidationError("No file provided");
  if (file.size > 2 * 1024 * 1024) throw new ValidationError("Image must be 2 MB or smaller");

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    throw new ValidationError("Only PNG, JPG, WEBP or GIF images are allowed");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `tenants/${tenantId}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await ctx.svc.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new ValidationError(uploadError.message);

  const {
    data: { publicUrl },
  } = ctx.svc.storage.from("avatars").getPublicUrl(path);

  const { error: updateError } = await ctx.svc
    .from("tenants")
    .update({ logo_url: publicUrl })
    .eq("id", tenantId);
  if (updateError) throw new ValidationError(updateError.message);

  await logAudit(req, ctx, {
    action: "update",
    entityType: "tenants",
    entityId: tenantId,
    description: "Updated hospital logo",
  });

  return ok({ logo_url: publicUrl });
});

export const runtime = "nodejs";