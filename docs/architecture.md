# SkyCare — Architecture

Developer: **Skyhouse Technologies** · Product: **SkyCare — The Smart Hospital OS for Africa**

## 1. System overview

```
┌─────────────────────────── Public internet ───────────────────────────┐
│                                                                      │
│  skycare.app (marketing)   {hospital}.skycare.app (hospital website) │
│       │                            │                                 │
│       └──────────┬─────────────────┘                                 │
│            Next.js 16 (frontend/)  — App Router, subdomain-aware     │
│              │  Supabase SSR session (JWT)                           │
│   ┌───────────┴───────────┐                                          │
│   │  Staff dashboard       │  Patient PWA (installable on any device)│
│   │  Hospital admin UI     │                                          │
│   └───────────┬───────────┘                                          │
├───────────────┼──────────────────────────────────────────────────────┤
│  Edge Functions (Deno)     Service role: onboarding, bookings,       │
│                            subscription webhooks, SMS/email, exports │
│  PostgREST (RLS-scoped)    Authenticated CRUD per tenant claims      │
│  PostgreSQL 15             tenants → branches → domain tables        │
│  Storage                   Lab reports, prescriptions, invoices,     │
│                            patient documents, logos                  │
└───────────────────────────────────────────────────────────────────────┘
```

## 2. Multi-tenancy model

- **Tenant = hospital.** `tenants` row with unique `slug` → `{slug}.skycare.app`
  subdomain; optional custom `domain`.
- **JWT claims** carry `{ tenant_id, role, branch_id }` (set at login by the
  edge function `auth/refresh-claims`). RLS helper functions read them — no
  per-request DB lookups on the hot path.
- **Branch layer** (Enterprise): staff are scoped to `branch_id`; `hospital_admin`
  sees all branches. Every hot table has `branch_id`.
- **Isolation enforced twice**: RLS in Postgres (row-level, not bypassable via
  client keys) AND branch filtering in the app for cross-branch admin views.

## 3. Roles & access matrix

| Role | Patients | Appointments | Clinical | Billing | Pharmacy | Lab | HR | Analytics |
|---|---|---|---|---|---|---|---|---|
| super_admin | platform-wide tooling & support | | | | | | | |
| hospital_admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| doctor | ✓ | ✓ | ✓ | read | ✓ | ✓ | roster | own |
| nurse | ✓ | ✓ | read/write visits | read | dispense | ✓ | roster | ✗ |
| pharmacist | read | ✗ | read Rx | ✗ | full | ✗ | ✗ | sales |
| lab_tech | read | ✗ | read | ✗ | ✗ | full | ✗ | tests |
| cashier | read | read | ✗ | full | ✗ | ✗ | ✗ | ✗ |
| patient_api | own | own | own (non-confidential) | own | own Rx | own results | ✗ | ✗ |

## 4. Module list (v1.0)

1. **Tenant & Onboarding** — signup edge function → tenant + main branch + admin
2. **Patients / EHR** — registration, demographics, NHIA/insurance, visit history
3. **Appointments** — scheduling, status lifecycle, SMS/email reminders
4. **Visits / Encounters** — check-in, vitals, diagnosis, follow-ups
5. **Billing** — invoices, items, payments (Paystack/Flutterwave/Mono + offline),
   NHIA claim flags, revenue-leakage alerts
6. **Pharmacy** — drugs, batches/expiry, stock movements, reorder alerts,
   e-prescribing, NAFDAC tracking
7. **Lab** — test catalog, orders, sample tracking, results (auto-flag abnormal)
8. **Ward/Bed** — wards, beds, admissions, discharge
9. **HR** — roster, shifts, attendance, leave
10. **Stores/Supply chain** — suppliers, POs, GRN, requisitions
11. **Notifications** — templates + in-app/SMS/email queue
12. **Analytics** — `analytics_daily` + views (revenue, appointments, per-branch)
13. **Hospital Website** — auto-generated public site per tenant
14. **Patient PWA** — booking, history, results, payments, chat
15. **Subscriptions** — SaaS billing → `subscription_invoices`

## 5. Data flow — end to end

```
Patient books on hospital website
  → edge fn booking-public (validates tenant slug via service role)
  → patients upsert (find-or-create by phone) + appointments insert
  → notification (appointment_reminder) queued
  → SMS/email edge fn sends → status 'sent'

Staff login → Supabase Auth → refresh-claims writes tenant_id/role/branch_id
  → PostgREST calls pass RLS filter → staff sees only own tenant(+branch)

Doctor completes visit → visits insert → analytics trigger bumps daily counts
  → lab order → results → abnormal flag → patient notified in PWA

Cashier records payment → payments insert (completed)
  → analytics total_revenue bump + invoice status recompute (trigger)
  → subscription webhook → tenant.plan stays current
```

## 6. Security

- RLS on every table; anon has SELECT on active `tenants` only (public sites).
- Service role keys live server-side (edge functions / Next route handlers only).
- `audit_logs` append-only; RLS select for `hospital_admin`/`super_admin`.
- JWT claims validated by `verify_jwt = true` on edge functions.
- Future: field-level encryption for clinical notes (AES-256-GCM) — see ADR.
- Compliance: NAFDAC reports, NHIA-ready data model, GDPR/NDPR posture.

## 7. Performance

- Composite indexes on `(tenant_id, …)` for every hot query path.
- `analytics_daily` upserted by triggers; dashboards read aggregates, not raw tables.
- Pagination everywhere (cursor-based for large tables: patients, audit_logs).
- PWA + Netlify CDN for static marketing; dynamic routes `force-dynamic`.