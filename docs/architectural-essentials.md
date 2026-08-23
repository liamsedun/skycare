# SkyCare HMS — Architecture Essentials

**Date:** August 22, 2026  
**Purpose:** Quick-reference for AI assistants and new developers

---

## Core Decisions

1. **Multi-tenant via RLS** — Every table has `tenant_id`. Service-client queries MUST filter it.
2. **JWT claims are source of truth** — `app_metadata { role, tenant_id, branch_id }`. Never trust client-supplied tenant/org IDs.
3. **Service client bypasses RLS** — Must always add `tenant_id` filter manually.
4. **`withAuth`/`withStaff` wraps every API route** — Gives `ctx { user, claims, tenantId, branchId, role, supabase, svc }`.
5. **`requireTenant(ctx)` throws for non-tenant callers** — `super_admin` with `tenantId === null` is platform-wide exception.
6. **`ok(data)` / `ApiError` family** — All responses use the envelope pattern.
7. **No `cookies()` inside `unstable_cache`** — Use `createServiceClient()` instead.
8. **RLS is safety net; API layer is authoritative guard** — Never trust client-supplied data.
9. **`patient_api` is only for patient-facing routes** — Must resolve family via `patients.user_id = ctx.user.id`.
10. **Audit duality** — DB triggers log RLS-scoped writes; API layer logs service-client writes. Never double-log, never skip.

---

## File Map (Critical Paths)

| Purpose | File |
|---------|------|
| JWT claims, role helpers | `src/lib/auth.ts` |
| API wrappers | `src/lib/api-utils.ts` |
| Rate limiter | `src/lib/rate-limit.ts` |
| Cache library | `src/lib/cache.ts` |
| Tenant loader | `src/lib/tenant.ts` |
| Navigation tree | `src/lib/nav.ts` |
| Cookie domain | `src/lib/cookie-domain.ts` |
| Proxy/abuse detection | `src/proxy.ts` |
| Theme tokens | `src/app/globals.css` |
| Dark mode | `html[data-theme=dark]` block in globals.css |
| Footer nav (staff) | `src/components/dashboard/mobile-nav.tsx` |
| Footer nav (patient) | `src/components/patient/mobile/mobile-app-ui.tsx` |
| Patient avatar helpers | `src/lib/patient-avatar.ts` |
| Paystack integration | `src/lib/paystack.ts` |
| Financial reports | `src/lib/financial-overview.ts` |
| HR payroll engine | `src/lib/hr-payroll-calc.ts` |
| HR schedules | `src/lib/hr-schedules.ts` |
| Pharmacy pricing | `src/lib/pharmacy-pricing.ts` |
| Banking sources | `src/lib/banking-sources.ts` |
| Module guard | `src/lib/module-guard.ts` |
| Notifications | `src/lib/notify.ts` |
| Audit logging | `src/lib/audit.ts` |
| Tenant settings | `src/lib/tenant-settings.ts` |
| Patient family | `src/lib/patient-family-shared.ts` |

---

## API Pattern

```typescript
// src/app/api/something/route.ts
import { withStaff } from "@/lib/api-utils";
import { ok, ApiError } from "@/lib/api-utils";

export const GET = withStaff(async (ctx) => {
  const { tenantId, svc } = ctx;
  
  const { data, error } = await svc
    .from("table_name")
    .select("*")
    .eq("tenant_id", tenantId);  // ALWAYS filter by tenant_id
    
  if (error) throw new ApiError(500, "Failed to fetch");
  return ok(data);
});
```

---

## Navigation System

- `navForRole(role, moduleAccess)` returns the full nav tree
- When `moduleAccess` is non-null, it is **authoritative** (role defaults skipped)
- `ALWAYS_VISIBLE_KEYS` = account, download, profile, settings
- Children pruned per key via `accessLevelOf({full,view_only,none})`

---

## Theming

- Light mode: Sky palette (sky-600 primary)
- Dark mode: "Dusk & Gold" (`#0a0f1a` navy, `#e0a84a` gold)
- Token remapping: `html[data-theme=dark]` block in `globals.css`
- Theme persisted in `users.preferences.jsonb`
- Server preference is authoritative (ThemeSync component)

---

## Known Gotchas

1. **PostgREST same-table double embed** — Aliasing required: `approver:users!staff_leave_approved_by_fkey(...)`
2. **`chat_presence` PK is `user_id`** — No `id` column; use `.select("*")` for wipes
3. **`expenses`/`other_income`.`payment_method` is free text** — NOT the enum
4. **`medical_records.record_type` is text CHECK** — Not an enum
5. **Node/undici overrides `host` header** — Must send `x-forwarded-host` for tenant resolution
6. **`process.exit()` inside `try` SKIPS `finally`** — Use `process.exitCode` instead
7. **GoTrue drops null keys from `app_metadata`** — `branch_id` key absent after null write
8. **Supabase CLI works via `npx supabase`** — Run from `backend\supabase`
9. **ESM scripts must pin supabase-js copy** — Use `createRequire` pattern
10. **Never run convert-sale/dispense legs inside pharmacy smokes** — Write immutable audit logs

---

## Migration Naming Convention

```
NNNN_description.sql
```

Applied via `npx supabase db push` from `backend\supabase`.

---

## Smoke Test Pattern

```javascript
// Create session cookie
const session = { access_token: "...", refresh_token: "..." };
const cookie = `sb-pvakwxeusbxesdealuuc-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

// Make request
const res = await fetch("http://localhost:3000/api/something", {
  headers: { Cookie: cookie }
});
const body = await res.json();
// Assert body.success === true, etc.
```

---

## Build & Verify

```bash
cd frontend
npm run build          # Production build (Turbopack)
npx tsc --noEmit       # Type check
npm run lint           # ESLint
npm test               # Vitest
```

Restart prod:
```powershell
Get-NetTCPConnection -LocalPort 3000 | Select -ExpandProperty OwningProcess -Unique | Stop-Process -Force
Start-Process node -ArgumentList "node_modules\next\dist\bin\next","start","-p","3000"
```
