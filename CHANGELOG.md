# Changelog

All notable changes to SkyCare are captured here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses
Semantic Versioning (targeting v1.0.0 at launch).

## [Unreleased]

### Added
- Unit test suite for `frontend/src/lib` (15 files, 157 tests) — daterange,
  auth, export helpers, tenant settings, pharmacy pricing, HR payroll engine,
  patient family helpers, Paystack client, API util envelope/parsing, nav
  access-level logic, theme + shift formatting + cookie-domain/tenant-link
  helpers.
- Component tests for the patient mobile UI kit and the theme sync/toggle
  (React Testing Library + mocked fetch; 22 tests).
- Test infrastructure: Vitest 4 + jsdom + coverage (30% global gate) wired into
  `vitest.config.ts` + `npm test`/`test:watch`/`test:coverage`.
- `typecheck`/`npm run typecheck` (`tsc --noEmit`).
- CI workflow (`.github/workflows/ci.yml`): lint, typecheck, tests, build.
- `Dockerfile` + `.dockerignore` for the frontend.
- `.env.example` documenting every environment variable.

### Fixed
- `tenantHomeUrl` mapped a bare root-domain host (e.g. `skycare.app`) to the
  local test domain instead of the https production tenant site.

## [0.1.0] — 2026-08-19 (C1 quality gate)

### Changed
- ESLint gate: 328 errors → 0 errors (608→ separate warnings from the
  React Compiler-era hooks rules stay visible but non-blocking).
- Dependency audit: 10 high-severity CVEs → 0 (nanoid, serialize-javascript,
  image-size overrides; removed dead `lucide-react-native` + `react-native-svg`).
- Fixed a Turbopack build blocker in `src/app/api/chats/route.ts` (const
  destructure reassignment).

### Security
- RLS hardening: 7 role-only staff-read policies now also require
  `tenant_id = get_tenant_id()`; pharmacy reference tables RLS-enabled; anon
  SELECT revoked on `branches`; SECURITY DEFINER function EXECUTE locked to
  `service_role` (incl. `ALTER DEFAULT PRIVILEGES` so future functions don't
  re-open the anon hole).

## Earlier milestones (Aug 2026)

- **Tenant websites**: auto-provision default site per tenant + first-run
  onboarding wizard + per-tenant pages/CMS/booking/sitemap/subdomain/About
  images + custom-domain manager + suspended banner.
- **Patient portal app conversion**: mobile bottom nav + More sheet on every
  `/patient` page; family page redesign + per-member detail page; lab icon
  moved into the menu; identity card phone/DOB + Prescription quick action.
- **Payroll**: SkyBooks-engineport (struct %s, statutory deductions, PAYE bands,
  reliefs), run numbering + runs index + PAYE/Pension/Payslip schedules, bulk
  approve/delete/edit of drafts, per-department payroll in the financial report.
- **HR suite**: staff profiles + shifts/roster (bulk assign, templates,
  bulk complete/cancel/delete, no credential gate for scheduling), attendance,
  leave (7 types + per-year policy), credentials, HR dashboard.
- **Banking & finance**: bank accounts, ledger, transfers, statements,
  reconciliation, opening balances, payroll posting, cash/bank selectors on
  expenses/income/pharmacy receipts.
- **Procurement**: supplier opening balances, drug↔supplier linkage, bulk PO
  grid + PO line import, replace-vs-keep CSV conflict flow, branch pricing.
- **Lab**: catalog re-categorisation + numeric-category guard, bulk delete,
  CSV upsert import, walk-in/external payments + bill-at-request-time.
- **Payments**: Paystack online payments (per-tenant keys, webhook, callback),
  patient-declared payments, patient receivable receipts.
- **Auth & tenancy**: parent-domain auth cookies (tenant-subdomain login),
  Google/Yahoo OAuth, self-service tenant signup with auto subdomain.

[Unreleased]: https://github.com/liamsedun/skycare-saas/compare/v0.1.0...main