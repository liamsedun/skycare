import { withAuth, ok, ValidationError } from "@/lib/api-utils";
import type { NextRequest } from "next/server";
import { rateLimit, API_UPLOAD } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// POST /api/uploads/avatar — upload a profile photo to the public avatars bucket
// Rate limited: 10 uploads/min per IP
export const POST = rateLimit(withAuth(async (req, ctx) => {
  const formData = await req.formData();
  const file = formData.get("avatar");
  if (!(file instanceof File)) throw new ValidationError("No file provided");
  if (file.size > 2 * 1024 * 1024) throw new ValidationError("Image must be 2 MB or smaller");

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    throw new ValidationError("Only PNG, JPG, WEBP or GIF images are allowed");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `users/${ctx.user.id}/avatar-${Date.now()}.${ext}`;

  const { error: uploadError } = await ctx.svc.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new ValidationError(uploadError.message);

  const { data: { publicUrl } } = ctx.svc.storage.from("avatars").getPublicUrl(path);

  const { error: updateError } = await ctx.svc
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", ctx.user.id);
  if (updateError) throw new ValidationError(updateError.message);

  return ok({ avatar_url: publicUrl });
}), API_UPLOAD);

export const runtime = "nodejs";