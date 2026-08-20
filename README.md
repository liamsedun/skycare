# SkyCare — The Smart Hospital OS for Africa

Multi-tenant hospital management SaaS by **Skyhouse Technologies**. Every hospital
gets the full HMS platform, a public hospital website, and a white-labelled patient
PWA — from a single Supabase-backed codebase.

## Repo layout

```
skycare-saas/
├── backend/                  # Supabase: SQL migrations, RLS, edge functions
│   └── supabase/
│       ├── migrations/       # versioned SQL (tenant schema → RLS → analytics → seed)
│       └── functions/        # Supabase Edge Functions (Deno)
├── frontend/                 # Next.js App Router + Tailwind + PWA
│   ├── src/
│   │   ├── app/              # pages + API routes (/app/* staff, /patient portal, /[slug] sites)
│   │   ├── components/       # shared + dashboard + patient + tenant UI
│   │   └── lib/              # auth, tenancy, calculators, exports, API utils
│   └── vitest.config.ts      # unit/component test runner (+ coverage gate)
├── .github/workflows/        # CI (lint, typecheck, test, build)
└── docs/                     # architecture, ADRs, API map
```

## High-level architecture

```
Public hospital website (<slug>.skycare.app)    Patient PWA (/patient)
        │                                              │
        └──────────────┬───────────────────────────────┘
                 Next.js App Router (frontend/)
                 subdomain → tenant routing (proxy + host headers)
        │
   Supabase Auth (JWT claims: tenant_id, role, branch_id)
        │
   API layer — REST routes + PostgREST with RLS as the safety net
        │
   PostgreSQL multi-tenant (RLS + tenant_id scoping) + Storage (avatars)
```

- **Tenant isolation** at the DB level via RLS (`auth.jwt()`-derived `tenant_id`);
  the API layer (`withAuth`/`withStaff` + service client) is the authoritative guard.
- **Roles**: `super_admin`, `hospital_admin`, `doctor`, `nurse`, `pharmacist`,
  `lab_tech`, `cashier`, `receptionist`, `patient_api` — with per-user module
  grants (`users.module_access`).

## Modules

Patients/EHR · Appointments · Billing & Payments · Pharmacy & Inventory (+ suppliers,
procurement, branch pricing, compliance) · Lab & Diagnostics · Wards & Bed Map ·
Staff & HR (profiles, shifts/roster, attendance, leave, credentials) · Payroll
(runs, PAYE/Pension schedules, payslips, SkyBooks engine) · Banking (accounts,
ledger, transfers, statements, reconciliation) · Expenses & Other Income · Internal
Mail · Chats · Medical Records & Reports · Financial Reports · Notifications ·
Hospital Websites (per-tenant branding, landing pages) · Patient PWA — plus a
per-tenant admin Settings suite and a first-run onboarding wizard.

## Local dev

1. `cd frontend`
2. `cp .env.example .env.local` and fill in the Supabase + feature keys.
3. `npm install`
4. `npm run dev` → http://localhost:3001

For tenant subdomains locally, the proxy resolves `<slug>.skycare.test` via the
`x-forwarded-host` header; route your browser/HTTP client at
`http://<slug>.skycare.test:3001` or pass the header to curl.

## Tests

The suite is Vitest 4 + React Testing Library; coverage runs in CI with a
30% global threshold.

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run test:coverage
npm run lint        # ESLint (0 errors gates CI)
npm run typecheck   # tsc --noEmit
npm run build       # Next production build (compiles all API routes)
```

## Branch strategy

- `main` — production deploy branch
- `feature/*` — per-module work

License: proprietary — Skyhouse Technologies.