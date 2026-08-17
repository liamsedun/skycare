export const PATIENT_GRADIENTS = [
  "from-sky-500 to-blue-600",
  "from-violet-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-400 to-orange-500",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-purple-600",
];

export function patientInitials(first: string, last: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "PT";
}

export function patientGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % PATIENT_GRADIENTS.length;
  return PATIENT_GRADIENTS[hash];
}

import type { SupabaseClient } from "@supabase/supabase-js";

// Data-URL avatars for patients/dependants (Life Blossom parity: the family
// page takes a photo, square-crops + resizes it client-side, then sends a
// base64 data URL here). Stored in the public `avatars` bucket under
// patients/<tenantId>/... — public read policy already exists (0010_migrations).
// Service-role writes bypass RLS; storage policies only gate authenticated
// clients writing under users/<uid>/.

const DATA_URL_RE = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i;
const MAX_BYTES = 2 * 1024 * 1024;

/** Validate a data-URL avatar and return { ext, buffer } or throw. */
export function parseAvatarDataUrl(dataUrl: string): { ext: string; buffer: Buffer } {
  const m = DATA_URL_RE.exec(dataUrl.trim());
  if (!m) throw new Error("Invalid photo data — expected a base64 JPG, PNG, WebP or GIF data URL");
  const ext = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, "");
  const buffer = Buffer.from(b64, "base64");
  if (buffer.byteLength === 0) throw new Error("Empty photo data");
  if (buffer.byteLength > MAX_BYTES) throw new Error("Photo must be 2 MB or smaller");
  return { ext, buffer };
}

/** Upload a base64 data-URL photo for a patient and return the public URL. */
export async function storePatientAvatar(
  svc: SupabaseClient,
  tenantId: string,
  patientId: string,
  dataUrl: string
): Promise<string> {
  const { ext, buffer } = parseAvatarDataUrl(dataUrl);
  const path = `patients/${tenantId}/${patientId}-${Date.now()}.${ext}`;
  const { error } = await svc.storage
    .from("avatars")
    .upload(path, buffer, { upsert: true, contentType: `image/${ext === "jpg" ? "jpeg" : ext}` });
  if (error) throw new Error(error.message ?? "Photo upload failed");
  const { data } = svc.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}