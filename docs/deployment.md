# SkyCare — Deployment Guide

Developer: Skyhouse Technologies · Brand: SkyCare

## 1. Supabase (backend)

1. Create a new project at supabase.com (e.g. `skycare-saas`, region Lagos/London).
2. Copy project URL + keys into `frontend/.env.local` (see `frontend/.env.example`).
3. Apply migrations in order — via SQL editor or CLI:
   ```
   cd backend
   supabase link --project-ref <ref>
   supabase db push          # applies backend/supabase/migrations/*
   ```
4. Deploy edge functions:
   ```
   supabase functions deploy tenant-onboarding
   ```
5. Set function secrets: `SUPABASE_SERVICE_ROLE_KEY` is injected automatically.
   Add SMS provider keys (Termii) when wiring notifications.
6. Storage: create buckets `hospital-assets`, `lab-reports`, `prescriptions`,
   `invoices`, `patient-docs` with tenant-scoped RLS policies.

## 2. Frontend (Netlify)

1. Push repo to GitHub, import into Netlify.
2. Build settings (netlify.toml already set): base `frontend`, command `npm ci && npm run build`.
3. Add env vars (Netlify → Site settings → Environment):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never expose to client)
   - `NEXT_PUBLIC_ROOT_DOMAIN=skycare.app`
4. Domains:
   - `skycare.app` → marketing + staff dashboard (apex).
   - `*.skycare.app` wildcard → same site (subdomain-routed hospital websites).
   - Custom domains: tenants add their domain via dashboard; Netlify TLS handles it.

## 3. Tenant onboarding flow (live)

1. Hospital visits `skycare.app/signup`, submits form.
2. Edge function `tenant-onboarding` creates: tenant + main branch + auth admin +
   `users` row, sets JWT claims.
3. Redirect to `{slug}.skycare.app` — hospital website live instantly.
4. Admin signs in → staff dashboard → invites staff, adds branches (Pro+),
   configures pharmacy/lab catalogs, branding.

## 4. Branch strategy (git)

- `main` — production (Netlify auto-deploy)
- `dev` — integration; Netlify deploys previews per PR
- `feature/*` — per-module work (e.g. `feature/pharmacy`, `feature/lab`)

## 5. Production readiness checklist

- [ ] RLS verified: anon can only read active `tenants`; nothing else
- [ ] JWT claims set on every login path (Supabase Auth + custom auth)
- [ ] Service role key used ONLY in edge functions / server routes
- [ ] Paystack/Flutterwave webhook endpoints verified + idempotent
- [ ] Storage buckets private with tenant-scoped policies
- [ ] Backups: Supabase PITR enabled (paid plan)
- [ ] Audit log retention + SIEM export (CSV)
- [ ] Monitoring: Supabase logs, Netlify analytics, error tracking (Sentry)
- [ ] NDPR/GDPR: consent record, data-export API for hospitals
- [ ] Load test: appointments & billing writes under branch concurrency