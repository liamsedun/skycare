import { withStaff, ok, ValidationError, requireTenant } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { invalidateLabCatalogCache } from "@/lib/cache";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface ImportLabServiceRecord {
  name?: string;
  type?: string;
  price?: number;
  newCategory?: string;
  referenceRange?: string;
  externalLabId?: string;
}

// POST /api/lab-services/import — bulk create-or-update from CSV rows.
// Matching is tenant + exact (case-insensitive) service name: rows whose name
// already exists OVERWRITE that service in place (price, type, category,
// reference range, external id); brand-new names are created, so the import
// never fails with "already exists". Category columns create the group when
// the caller is an admin, else fall back to the existing group or uncategorized.
// Admins/lab staff may update existing services; other staff create only.
export const POST = withStaff(async (req, ctx) => {
  const tenantId = requireTenant(ctx);
  const body = (await req.json()) as { records?: ImportLabServiceRecord[] };
  const records = Array.isArray(body.records) ? body.records : [];
  if (records.length === 0) throw new ValidationError("No records to import");

  const isAdmin = ctx.role === "hospital_admin" || ctx.role === "super_admin";
  const canEditCatalog = isAdmin || ctx.role === "lab_tech";
  const errors: { row: number; message: string }[] = [];
  let created = 0;
  let updated = 0;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const rowNo = i + 2; // 1-indexed including the header row
    const name = rec.name?.trim();
    if (!name) {
      errors.push({ row: rowNo, message: "Service name is required" });
      continue;
    }
    const type = rec.type === "imaging" ? "imaging" : "lab";
    try {
      let categoryId: string | null = null;
      if (rec.newCategory?.trim()) {
        const catName = rec.newCategory.trim();
        if (/^\d+(\.\d+)?$/.test(catName)) {
          errors.push({ row: rowNo, message: `Category "${catName}" looks like a price — ignored; use a real category name` });
        } else {
          const { data: cat } = await ctx.svc
            .from("lab_categories")
            .select("id")
            .eq("tenant_id", tenantId)
            .ilike("name", catName)
            .maybeSingle();
          if (cat) {
            categoryId = cat.id;
          } else if (isAdmin) {
            const { data: nc, error: ne } = await ctx.svc
              .from("lab_categories")
              .insert({ tenant_id: tenantId, name: catName })
              .select("id")
              .single();
            if (ne) throw new Error(ne.message);
            categoryId = nc.id;
          }
        }
      }

      const { data: existing } = await ctx.svc
        .from("lab_services")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("name", name)
        .maybeSingle();

      if (existing) {
        if (!canEditCatalog) {
          errors.push({ row: rowNo, message: `"${name}" already exists (only hospital admins and lab staff can update it)` });
          continue;
        }
        const patch: Record<string, unknown> = {
          price: rec.price ?? 0,
          type,
          reference_range: rec.referenceRange?.trim() || null,
          external_lab_id: rec.externalLabId?.trim() || null,
        };
        if (categoryId) patch.category_id = categoryId;
        const { error: ue } = await ctx.svc.from("lab_services").update(patch).eq("id", existing.id);
        if (ue) {
          errors.push({ row: rowNo, message: ue.message });
          continue;
        }
        updated++;
      } else {
        const { error: ie } = await ctx.svc.from("lab_services").insert({
          tenant_id: tenantId,
          category_id: categoryId,
          name,
          type,
          is_custom: true,
          external_lab_id: rec.externalLabId?.trim() || null,
          approval_status: isAdmin ? "approved" : "pending",
          approved_at: isAdmin ? new Date().toISOString() : null,
          approved_by: isAdmin ? ctx.user.id : null,
          created_by: ctx.user.id,
          price: rec.price ?? 0,
          reference_range: rec.referenceRange?.trim() || null,
        });
        if (ie) {
          errors.push({ row: rowNo, message: ie.message });
          continue;
        }
        created++;
      }
    } catch (e) {
      errors.push({ row: rowNo, message: e instanceof Error ? e.message : "Import failed" });
    }
  }

  await logAudit(req, ctx, {
    action: "update",
    entityType: "lab_services",
    entityId: `bulk/${created}/${updated}`,
    description: `CSV service import: ${created} created, ${updated} updated, ${errors.length} failed`,
  });

  await invalidateLabCatalogCache(tenantId);

  return ok({ created, updated, errors });
});

export const runtime = "nodejs";