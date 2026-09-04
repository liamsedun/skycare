import {
  withStaff,
  ok,
  ValidationError,
  ForbiddenError,
  requireTenant,
} from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/uploads/doctor-photo — upload a website doctor photo to the public avatars bucket
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  if (ctx.role !== "hospital_admin") {
    throw new ForbiddenError("Only admins can upload doctor photos");
  }

  const formData = await req.formData();
  const file = formData.get("photo");
  if (!(file instanceof File)) throw new ValidationError("No file provided");
  if (file.size > 2 * 1024 * 1024) throw new ValidationError("Image must be 2 MB or smaller");

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    throw new ValidationError("Only PNG, JPG, WEBP or GIF images are allowed");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `tenants/${tenantId}/doctors/doc-${Date.now()}.${ext}`;

  const { error: uploadError } = await ctx.svc.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new ValidationError(uploadError.message);

  const {
    data: { publicUrl },
  } = ctx.svc.storage.from("avatars").getPublicUrl(path);

  await logAudit(req, ctx, {
    action: "create",
    entityType: "landing_doctors",
    entityId: null,
    description: "Uploaded website doctor photo",
  });

  return ok({ photo_url: publicUrl });
});

export const runtime = "nodejs";