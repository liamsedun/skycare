# SkyCare — The Smart Hospital OS for Africa

Multi-tenant hospital management SaaS by **Skyhouse Technologies**. Every hospital
gets the full HMS platform, a public hospital website, and a white-labelled patient
PWA — from a single Supabase-backed codebase.

## Repo layout

```
skycare-saas/
├── backend/                  # Supabase: database, RLS, edge functions, service layer
│   ├── supabase/
│   │   ├── migrations/       # versioned SQL (tenant schema → RLS → analytics → seed)
│   │   ├── functions/        # Supabase Edge Functions (Deno)
│   │   └── config.toml
│   └── src/                  # service-layer reference (Supabase client patterns)
├── frontend/                 # Next.js App Router + Tailwind + PWA (Netlify)
├── docs/                     # architecture, ADRs, API map
└── README.md
```

## High-level architecture

```
Public hospital website (tenant.skycare.app)   Patient PWA (patient portal)
        │                                              │
        └──────────────┬───────────────────────────────┘
                 Next.js App Router (frontend/)
                 subdomain → tenant routing
        │
   Supabase Auth (JWT: tenant_id, role, branch_id)
        │
   API layer — Supabase Edge Functions + RLS-scoped table access
        │
   PostgreSQL multi-tenant (tenant_id scoping + branch_id) + Storage
```

- **Tenant isolation** at the DB level via RLS (`auth.jwt()`-derived `tenant_id`).
- **Branch isolation** as a sub-tenancy: staff scoped to branch, admin sees all.
- **Role-based access**: `super_admin`, `hospital_admin`, `doctor`, `nurse`,
  `pharmacist`, `lab_tech`, `cashier`.

## Modules

Patients/EHR · Appointments · Visits/Encounters · Billing & Payments ·
Pharmacy & Inventory · Lab & Diagnostics · Ward & Bed · Staff/HR · Stores &
Supply Chain · Notifications · Reports/Analytics · Hospital Websites · Patient PWA

## Local dev

1. `cd frontend && npm install && npm run dev`
2. Supabase CLI for backend: `cd backend && supabase start`
3. Deploy frontend to Netlify; run Supabase migrations in the hosted project.

## Branch strategy

- `main` — production deploy branch
- `dev` — integration branch (default working branch)
- `feature/*` — per-module work

License: proprietary — Skyhouse Technologies.