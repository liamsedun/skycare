# SkyCare HMS — Architecture Document

**Version:** 2.0  
**Date:** August 22, 2026  
**Developer:** Skyhouse Technologies  
**Product:** SkyCare — The Smart Hospital OS for Africa  
**Repo:** github.com/liamsedun/skycare  
**Production Ref:** `pvakwxeusbxesdealuuc` (Supabase)  
**Live Domain:** `skycare.app`

---

## 1. System Overview

```
┌─────────────────────────── Public internet ────────────────────────────┐
│                                                                       │
│  skycare.app (marketing)    {hospital}.skycare.app (hospital website)  │
│       │                             │                                  │
│       └───────────┬─────────────────┘                                  │
│           Next.js 16.3 (frontend/)  — App Router, Turbopack           │
│             │  Supabase SSR session (JWT)                              │
│   ┌─────────┴─────────────┐                                            │
│   │  Staff Dashboard       │  Patient PWA (installable on any device)  │
│   │  /app/* (15+ modules)  │  /patient/* (10+ pages)                   │
│   └─────────┬─────────────┘                                            │
├─────────────┼──────────────────────────────────────────────────────────┤
│  Edge Functions (Deno)     Service role: onboarding, bookings,         │
│                            subscription webhooks, SMS/email, exports   │
│  PostgREST (RLS-scoped)    Authenticated CRUD per tenant claims        │
│  PostgreSQL 15             tenants → branches → 100+ domain tables     │
│  Storage                   8 buckets (3 public, 5 private)             │
│  Auth (GoTrue)             Email/password, OAuth (Google, Yahoo)        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Tenancy Model

### Isolation Contract
- **Tenant = hospital.** `tenants` row with unique `slug` → `{slug}.skycare.app`
- **JWT claims** carry `{ tenant_id, role, branch_id }` — set at login by
  edge function `auth/refresh-claims`
- **RLS helper functions** read claims — no per-request DB lookups on hot path
- **Branch layer** (Enterprise): staff scoped to `branch_id`; hospital_admin sees all

### Isolation Enforcement (Three Layers)
1. **PostgreSQL RLS** — row-level, not bypassable via client keys
2. **API-layer `withAuth`/`withStaff`** — `requireTenant(ctx)` throws for non-tenant callers
3. **Service-client queries MUST filter `tenant_id = requireTenant(ctx)`** — service role bypasses RLS

### RLS Helper Functions (SQL)
```sql
get_tenant_id()    -- from JWT claims
get_role()         -- from JWT claims
get_branch_id()    -- from JWT claims
is_super_admin()   -- role = 'super_admin'
is_hospital_admin() -- role = 'hospital_admin'
is_staff()         -- non-patient role
is_patient()       -- role = 'patient_api'
```

---

## 3. Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Frontend** | Next.js | 16.3.0 | App Router, Turbopack |
| **UI** | Tailwind CSS | v4 | CSS-first theming, dark mode |
| **Components** | shadcn/ui | latest | Radix UI primitives |
| **Charts** | Recharts | 3.10.1 | Dashboard + reports |
| **Icons** | Lucide React | latest | Consistent icon set |
| **PWA** | Next.js Service Worker | — | Installable on mobile |
| **Database** | PostgreSQL | 15 | Supabase-hosted |
| **ORM** | Supabase JS | 2.111.0 | Service + anon clients |
| **Auth** | GoTrue | — | Supabase Auth |
| **Storage** | Supabase Storage | — | S3 + CloudFront |
| **Runtime** | Node.js | LTS | `next start` on port 3000 |
| **AI** | Supabase Edge Functions | — | Pharmacy AI (Deno) |
| **Payments** | Paystack | REST API | Card + bank transfer |
| **Testing** | Vitest | latest | 206+ tests, coverage gate |
| **Linting** | ESLint | 16.2.12 | 0 errors, ~602 warnings |
| **TypeCheck** | TypeScript | strict | tsc --noEmit |
| **CI** | GitHub Actions | v5 | lint → typecheck → test → build |
| **Hosting** | Netlify | — | CDN + edge functions |
| **DNS** | Cloudflare | — | WAF + DDoS + bot protection |

---

## 4. Repo Layout

```
skycare--saas-hosp/
├── backend/
│   └── supabase/
│       ├── migrations/          # 103 SQL migrations (0001–0103)
│       └── functions/           # Supabase Edge Functions (Deno)
├── frontend/
│   └── src/
│       ├── app/                 # Next.js App Router pages
│       │   ├── [slug]/          # Public hospital website (8 pages)
│       │   ├── app/             # Staff dashboard (15+ module pages)
│       │   ├── patient/         # Patient portal (10+ pages)
│       │   ├── api/             # API routes (150+ endpoints)
│       │   └── login/           # Shared login page
│       ├── components/          # React components
│       │   ├── dashboard/       # Staff portal components
│       │   ├── patient/         # Patient portal components
│       │   ├── tenant/          # Public website components
│       │   ├── auth/            # Login/signup forms
│       │   ├── print/           # Tenant letterhead for PDF print
│       │   └── ui/              # shadcn/ui primitives
│       ├── lib/                 # Shared utilities
│       │   ├── auth.ts          # JWT claims, role helpers
│       │   ├── api-utils.ts     # withAuth, withStaff, ok(), ApiError
│       │   ├── rate-limit.ts    # Rate limiter, login lockout
│       │   ├── cache.ts         # unstable_cache + revalidateTag
│       │   ├── tenant.ts        # loadTenant(), isLocalHost()
│       │   ├── nav.ts           # Navigation tree per role
│       │   └── ...              # Domain-specific libs
│       └── proxy.ts             # Abuse detection, session management
├── docs/                        # Architecture, API map, deployment
├── .github/workflows/           # CI pipeline
├── AGENTS.md                    # AI agent instructions
└── SECURITY-ARCHITECTURE.md     # Security documentation
```

---

## 5. Authentication & Authorization

### JWT Claims Structure
```json
{
  "role": "hospital_admin",
  "tenant_id": "uuid",
  "branch_id": "uuid | null"
}
```

### Role Hierarchy (25 roles)
```
super_admin          — Cross-tenant platform management
hospital_admin       — Full hospital access
doctor               — Clinical: patients, appointments, prescriptions, lab
nurse                — Clinical: patients, appointments, rounds
pharmacist           — Pharmacy: inventory, dispensing, compliance
lab_tech             — Laboratory: orders, results, services
cashier              — Billing: invoices, payments, banking
receptionist         — Front desk: appointments, patients
hr_officer           — HR: staff, payroll, roster, attendance, leave
accountant           — Finance: payroll view, reports
nurse_manager        — Clinical leadership
medical_officer      — Clinical officer
pharmacist_tech      — Pharmacy technician
lab_assistant        — Lab support
ward_nurse           — Ward-specific nursing
matron               — Maternity/matron
hospital_admin_d     — Deputy admin
procurement_team     — Purchase orders, supplier management
data_entry           — Data entry clerk
it_support           — Technical support
quality_officer      — Quality assurance
nursing_assistant    — Nursing support
student_nurse        — Trainee nurse
intern               — Medical intern
patient_api          — Patient portal access
```

### Module Access System
- Per-user `users.module_access` JSONB grants
- Three levels: `full`, `view_only`, `none`
- `navForRole()` uses grants as authoritative (overrides role defaults when set)
- `requireModuleLevel()` guards API routes per module

### Auth Providers
- Email/password (primary)
- Google OAuth (native Supabase provider)
- Yahoo (custom OIDC via `custom:yahoo`)
- OAuth accounts MUST match an existing hospital account

### Security Controls
- Rate limiting: 100 req/min (standard), 10 req/min (auth)
- Login lockout: 5 failed attempts → 15 min lockout
- Idle auto-logout: 15 minutes
- CSP headers, X-Frame-Options DENY, nosniff
- RLS on 100+ tables
- Function EXECUTE hardening (migrations 0097/0100)
- Cross-tenant isolation verified by smoke tests

---

## 6. API Architecture

### Convention
- All routes in `frontend/src/app/api/`
- Response envelope: `ok(data, status?)` / `okPaginated(data, total, page, pageSize)`
- Errors: `ApiError` family (AuthError 401, ForbiddenError 403, NotFoundError 404, ValidationError 400)
- Pagination: `getPagination(searchParams)` → `{ page, pageSize, from, to }`

### Route Count by Module
| Module | Routes | Notes |
|--------|--------|-------|
| Auth | 5 | login, logout, me, change-password, preferences |
| Admin/Users | 3 | list, [id], [id]/reset-password |
| Patients | 3 | list, [id], me |
| Dependants | 4 | list, [id], provision-portal, provision-portal |
| Appointments | 2 | list, [id] |
| Invoices | 3 | list, [id], [id]/print |
| Payments | 6 | initialize, webhook, callback, record, declare, cancel |
| Billing | 1 | summary |
| Prescriptions | 3 | list, [id], [id]/convert-sale |
| Lab | 6 | tests, services, orders, results, requests, walk-in |
| Pharmacy Admin | 8 | drugs, categories, import, branches, suppliers, ... |
| Pharmacy Billing | 5 | invoices, payments, compliance, procurement, ... |
| Wards | 5 | beds, admissions, discharges, rounds, bed-map |
| HR | 15 | staff, shifts, roster, attendance, leave, payroll, ... |
| Banking | 5 | accounts, transfers, statements, entries, ledger |
| Expenses/Income | 4 | expenses, other-income, categories, import |
| Mail | 5 | inbox, sent, recipients, unread-count, [id] |
| Chats | 4 | list, [id]/messages, directory, presence |
| Notifications | 4 | list, unread-count, [id], push endpoints |
| Settings | 4 | tenant-settings, bank-accounts, branding |
| Reports | 3 | dashboard, financial-reports, medical-reports |
| System | 3 | backup, reset, restore |
| Subscription | 2 | GET, PUT |
| Landing | 2 | doctors, [id] |
| Uploads | 1 | avatar |
| Account | 2 | preferences GET/PUT |
| **Total** | **150+** | |

---

## 7. Database Schema

### Migrations Applied (103)
- **0001–0007**: Multi-tenant foundation (tenants, branches, users, patients, appointments, billing)
- **0008**: HMS port (staff, expenses, other-income, doctor-notes, mail, chats, bank accounts, duty roster, medical reports, push subscriptions, security events, audit triggers)
- **0009**: Staff backfill for seed users
- **0010**: Public `avatars` bucket + storage policies
- **0011**: Drop anon SELECT on `landing_doctors`
- **0012**: `users.preferences` jsonb column
- **0013–0050**: Pharmacy enhancements (drug catalogue, batches, stock, compliance, AI, NAFDAC)
- **0051–0060**: Wards, appointments, billing enhancements, prescription fan-out
- **0061–0080**: Banking, expenses, income, supplier management, branch pricing
- **0081–0090**: HR module (payroll, roster, attendance, leave, credentials)
- **0091–0096**: Website provisioning, onboarding, diagnostics
- **0097–0103**: RLS hardening, function EXECUTE hardening, leave policy, dark mode SSR, cache, rate limit, security headers

### Key Tables (100+)
```
tenants                    — Hospital accounts
branches                   — Multi-branch support
users                      — Staff/patient user records
patients                   — Patient register
appointments               — Appointment scheduling
invoices / invoice_items   — Billing
payments                   — Payment records
prescriptions / prescription_items — Pharmacy
lab_orders / lab_requests / lab_results — Laboratory
pharmacy_drugs / pharmacy_stock_batches / pharmacy_branch_stock — Drug inventory
pharmacy_invoices / pharmacy_payments — Pharmacy billing
ward_beds / admissions / discharges — Ward management
duty_roster / staff_shifts / staff_leave — HR scheduling
payroll_records / payroll_lines — Payroll
hospital_bank_accounts / hospital_bank_ledger — Banking
expenses / other_income — Finance
internal_messages / internal_message_recipients — Mail
chats / chat_messages / chat_presence — Messaging
medical_records / doctor_notes / medical_reports — Clinical
audit_logs / security_events — Security
```

### Storage Buckets (8)
| Bucket | Access | Purpose |
|--------|--------|---------|
| `avatars` | Public | Patient/profile photos |
| `avatars-staff` | Private | Staff profile photos |
| `hospital-logos` | Public | Hospital branding |
| `prescription-pdfs` | Private | Generated prescription PDFs |
| `lab-reports` | Private | Lab result documents |
| `invoices` | Private | Invoice PDFs |
| `medical-records` | Private | Patient documents |
| `tenant-assets` | Private | Hospital-specific assets |

---

## 8. Caching Strategy

Implemented in `frontend/src/lib/cache.ts`:
- **`unstable_cache`** with `createServiceClient()` (no cookies() in cache)
- **`revalidateTag()`** for targeted invalidation on writes
- **Stampede protection** with 30s cooldown
- **Cache invalidation** in 12+ write endpoints (CRUD for pharmacy, labs, wards, HR, banking, patients, expenses)
- **Cache-Control headers** for static assets (`_next/static` 1yr, `/images` 30d, `/icons` 30d)

---

## 9. Security Architecture

### Defense-in-Depth
```
Internet → Cloudflare (WAF+DDoS+Bot) → Netlify (CDN) → Next.js Proxy (Abuse+Auth) → API (Rate Limit+RLS) → Supabase (DB Isolation)
```

### Headers (next.config.ts)
- CSP: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`; `frame-src 'self' https://www.google.com https://maps.google.com`
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera/microphone/geolocation/payment disabled

### Rate Limiting
| Endpoint | Limit |
|----------|-------|
| Standard API | 100 req/min/IP |
| Auth endpoints | 10 req/min/IP |
| Identifier resolution | 20 req/min/IP |
| File uploads | 10 req/min/IP |
| Payment | 20 req/min/IP |
| Webhooks | 100 req/min/IP |

### RLS Hardening (Migrations 0097+0100)
- 7 role-only policies rewritten to also require tenant_id
- Pharmacy reference tables RLS-enabled
- SECURITY DEFINER RPCs: `REVOKE ALL FROM PUBLIC, anon, authenticated` + grant `service_role`
- Default privileges: `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`

---

## 10. AI Architecture

### Pharmacy AI (Edge Functions)
All functions in `backend/supabase/functions/`:
- `pharmacy-forecast-demand` — 30/90-day demand prediction
- `pharmacy-recommend-drugs` — Diagnosis-based recommendations
- `pharmacy-check-interactions` — Drug interaction detection
- `pharmacy-suggest-alternatives` — Same-category substitutions
- `pharmacy-suggest-pricing` — Nigeria retail margin bands
- `pharmacy-detect-anomalies` — Dispensing/billing anomalies
- `pharmacy-auto-reorder` — Purchase order suggestions
- `pharmacy-ai-sweep` — One-call full analysis

### AI RPCs (PostgreSQL SECURITY DEFINER)
- `pharmacy_recommend_drugs`, `pharmacy_alternatives`, `pharmacy_interaction_check`, `pharmacy_suggest_pricing`
- All locked: `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role`

---

## 11. Deployment

- **Hosting**: Netlify (Next.js 16 on Node.js runtime)
- **Database**: Supabase (PostgreSQL 15, hosted)
- **CDN**: Cloudflare (DNS + WAF + DDoS)
- **Edge Functions**: Supabase (Deno runtime)
- **CI/CD**: GitHub Actions (lint → typecheck → test → build)
- **Domain**: `skycare.app` with `<slug>.skycare.app` subdomains

### Production Environment
- Supabase ref: `pvakwxeusbxesdealuuc`
- Port: 3000 (Next.js production server)
- Bound to: `0.0.0.0` (all interfaces for LAN access)
- Node.js: LTS

---

## 12. Testing Strategy

| Type | Tool | Count | Coverage |
|------|------|-------|----------|
| Unit | Vitest | 206+ | ~29% statements |
| Integration | Vitest | Tests use real Supabase | — |
| Smoke | Custom scripts | 15+ scripts | Per-feature |
| Lint | ESLint | 0 errors | ~602 warnings |
| TypeCheck | TypeScript | 0 errors | Strict mode |
| CI | GitHub Actions | 4 stages | Automated |

---

## 13. Outstanding Architecture Work

| Item | Priority | Impact |
|------|----------|--------|
| Custom domain provisioning (auto-DNS) | Medium | Enterprise feature |
| Redis caching layer (replace in-memory) | Medium | Multi-instance support |
| WebSocket for real-time chat (replace polling) | Medium | Better UX |
| Background job queue (for AI, exports) | Medium | Performance |
| API versioning | Low | Future-proofing |
| GraphQL API | Low | Optional |
| OpenAPI/Swagger docs | Medium | Developer experience |
| Field-level encryption (clinical notes) | Low | GDPR/NDPR |
| Audit log archival | Low | Storage management |
| E2E test suite (Playwright) | Medium | Quality assurance |
