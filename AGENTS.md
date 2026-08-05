<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.2.12, Turbopack builds) has breaking changes â€” APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## What this project is

SkyCare â€” a multi-tenant hospital management SaaS ("HMS SaaS"). Hospitals subscribe as **tenants** and get their own branded site at `<slug>.skycare.app` plus a staff dashboard (`/app/*`) and a patient portal (`/patient`, in progress). Every hospital manages its own admins/staff/patients; tenants are strictly isolated from each other. The admin/staff/patient features were ported from the life-blossom-hosp reference repo (`C:\Users\Admin\Downloads\life-blossom-hosp` â€” read-only, never modify it; its AGENTS.md is the house style for this workspace).

## Repo layout

- `frontend/` â€” Next.js 16 app (App Router, Turbopack). All UI + API routes (`src/app/api/**`).
- `backend/supabase/` â€” SQL migrations applied to the linked Supabase project via `npx supabase db push` (run from `backend\supabase`). Migration `0001`â€“`0007` = pre-existing multi-tenant foundation; `0008` = HMS port (staff/expenses/other-income/doctor-notes/landing-doctors/internal mail/chats/bank accounts/duty roster/medical reports/push subscriptions/security events + audit triggers + RLS hardening); `0009` = staff backfill for seed users; `0010` = public `avatars` bucket + storage policies.
- Prod Supabase ref: `pvakwxeusbxesdealuuc` (linked from `backend\supabase`, CLI logged in). Keys live in `frontend/.env.local` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_ROOT_DOMAIN).

## Tenancy & isolation contract (CRITICAL)

- JWT claims live in `app_metadata { role, tenant_id, branch_id }`; RLS helpers in SQL read them: `get_tenant_id()`, `get_role()`, `get_branch_id()`, `is_super_admin()`, `is_hospital_admin()`, `is_staff()`, `is_patient()`, `is_family_primary()`, `family_patient_ids()`.
- Roles: `super_admin` (cross-tenant platform), `hospital_admin`, `doctor`, `nurse`, `pharmacist`, `lab_tech`, `cashier`, `receptionist`, `patient_api`. `ROLE_LABELS`/`getClaims`/`isStaffRole` in `frontend/src/lib/auth.ts`.
- **Every API route must be wrapped in `withAuth`/`withStaff`** (from `frontend/src/lib/api-utils.ts`), giving `ctx { user, claims, tenantId, branchId, role, supabase, svc }`. `requireTenant(ctx)` throws for non-tenant callers.
- **Service-client (`ctx.svc`) queries MUST filter `tenant_id = requireTenant(ctx)`** â€” service role bypasses RLS. `super_admin` with `tenantId === null` is the only platform-wide exception.
- `patient_api` is only accepted in patient-facing routes (appointments, dependants, invoices, payments declare, prescriptions, medical-records, lab-orders) and must resolve its family via `patients.user_id = ctx.user.id` (+ `primary_account_id` for dependants) before every query.
- RLS stays the safety net; the API layer is the authoritative guard. Never trust client-supplied tenant/org ids.

## Audit duality (who logs what)

- DB triggers `public.log_audit()` fire ONLY when `auth.uid()` is set (RLS-scoped writes). Service-role writes skip triggers (auth.uid() is NULL) and are logged by the API layer via `frontend/src/lib/audit.ts` (`logAudit`/`logView`/`flagSecurityEvent`/`checkLoginLockout`/`logAuth`).
- **Never double-log and never skip**: a write is logged by the trigger XOR the API, depending on which client wrote it. `logView` powers the rapid-view anomaly (>8 views/5 min â†’ `security_events`).

## API conventions

- Response envelopes: `ok(data, status?)`, `okPaginated(data, total, page, pageSize)` â†’ `{ success, data, meta: { page, pageSize, total, totalPages } }`. Errors: `ApiError` family (`AuthError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ValidationError` 400) mapped by `withAuth`.
- `getPagination(searchParams)` â†’ `{ page, pageSize, from, to }` (range inclusive). `resolveParam` unwraps App Router params. `parseBody` for JSON.
- Role constants: `BILLING_ROLES = [hospital_admin, cashier, super_admin]`, `CLINICAL_ROLES = [hospital_admin, doctor, nurse, super_admin]`, `ADMIN_ROLES = [hospital_admin, super_admin]`.
- Number generators: `frontend/src/lib/tenant-settings.ts` (`generatePatientNumber`/`generateStaffNumber`/`generateInvoiceNumber`, prefixes from `tenants.settings` JSONB).
- Notifications: `frontend/src/lib/notify.ts` `notifyUsers(svc, { orgId, userIds, type, title, message, referenceType, referenceId })` â€” types: appointment_reminder, payment_declared/confirmed/cancelled, lab_result, prescription_refill, etc.

## Known gotchas

- `lab_orders` and `appointments` each have TWO FKs to `users` (doctor_id + created_by) â†’ embedding `users(...)` returns PostgREST PGRST201 (ambiguous). Always use FK hints: `users!lab_orders_doctor_id_fkey(...)`, `users!appointments_doctor_id_fkey(...)`.
- `chat_presence` PK is `user_id` (no `id` column) â€” `select=id` 400s.
- `expenses`/`other_income`.`payment_method` is free `text` (default 'cash'), NOT the `payment_method` enum.
- `medical_records.record_type` is a text CHECK (9 values), not an enum; confidential records are RLS-hidden from `patient_api`.
- Family model: `patients.is_primary_account`, `primary_account_id`, `dependant_relationship`; cap 5 dependants; dependants link to the primary holder only.
- Seed/demo: tenant "demoCare Hospital" id `10000000-0000-0000-0000-000000000001`; smoke login `smoketest@skycare.app` / `smoketest123!` (hospital_admin). Seeded doctors (dr.tunde@, dr.grace@) got `staff` rows in migration 0009.
- Dashboard server pages fetch directly via RLS client (`createClient()`, `frontend/src/lib/supabase/server.ts`); heavy/cross-table reads go through API routes with the service client.
- `frontend/src/lib/nav.ts` had `soon: true` nav items; all are now landed (Settings was the last) â€” no `soon` flags remain.

## Work State (Aug 2026)

### Completed
- **Tenant onboarding & auth** â€” signup edge function creates hospital_admin + tenant claims; login redirects by role (`patient_api` â†’ /patient, else /app); disabled accounts bounced at login + app layout; idle auto-logout 15 min â†’ POST /api/auth/logout (audit entry).
- **Admin/staff management** â€” `/app/staff` (hospital_admin/super_admin): create admins/staff with direct credentials (`POST /api/admin/users` via `svc.auth.admin.createUser` + users mirror + staff row; `GRANTABLE_ROLES` excludes super_admin), role change with app_metadata sync, reset password, activate/deactivate, self/super_admin guards.
- **Patients & family** â€” `/app/patients`: register (auto `PT-` number, optional portal login), view/edit, dependants add/remove (cap 5), medical records section (add w/ confidential flag). APIs: `api/patients(+[id])`, `api/dependants(+[id])`, `api/medical-records(+[id])`.
- **Appointments** â€” `/app/appointments`: create (patient/doctor/type), status actions (confirm/start/complete/cancel), patient portal notifications. APIs: `api/appointments(+[id])`.
- **Billing** â€” `/app/billing` (admin/cashier): create invoice (dynamic items + VAT + discount, `INV-` number), status filters, detail view with payment history, record payment (multi-invoice allocation, auto invoice paid/partially_paid sync, confirms patient's pending declaration in place), pending-declaration confirm/decline panel. APIs: `api/invoices(+[id])`, `api/payments`, `api/payments/record|declare|cancel` (+`api/expenses(+[id])`, `api/other-income(+[id])`).
- **Pharmacy** â€” `/app/pharmacy` (clinical): prescriptions list/filters, create (dynamic medications), per-item dispensing w/ auto status. APIs: `api/prescriptions(+[id])`.
- **Laboratory** â€” `/app/lab`: orders + status flow (requested â†’ sample_collected â†’ in_progress â†’ completed), per-test results (result/unit/abnormal), test catalog manager. APIs: `api/lab-tests(+[id])`, `api/lab-orders(+[id])`.
- **Audit & security UI** â€” `/app/audit-logs` (hospital_admin/super_admin; nav item w/ ShieldCheck): tabs for Audit Logs + Security Events, filters (entity type/action/role/event type/severity/date range), expandable column-diff (JSON old/new) + metadata views, page-aware CSV export, pagination. APIs: `GET /api/audit-logs` (tenant-scoped; filters entity_type, entity_id, user_id, role, action, from, to) and `GET /api/security-events` (tenant-scoped **plus global tenant_id IS NULL rows** via `.or(tenant_id.eq.X,tenant_id.is.null)`, mirroring the `security_events_admin_read` RLS policy; filters event_type, severity, user_id, from, to) â€” both `withStaff` + ADMIN_ROLES check, users embed.
- **Landing/mobile** â€” responsive landing + tenant sites (mobile nav dropdowns, gallery widths, `[slug]` header truncation), green Start Free Trial buttons, patients/appointments mobile card layouts.
- **Patient portal** (`/patient`) â€” `patient/layout.tsx` (patient_api guard, only-if-active, tenant name) + PatientShell (`components/patient/patient-shell.tsx`, nav in `lib/patient-nav.ts`); pages: Overview dashboard (cards + upcoming appointments + bills), Appointments (book w/ family picker via `GET /api/patients/me`, cancel), Bills & payments (invoice detail w/ items+payments, declare-payment modal â†' `POST /api/payments/declare`), Prescriptions (items, dispensed qty), Lab results (test rows, abnormal flags, pending/ready), Family (add dependant w/ optional portal login, remove). All family-scoped via the existing APIs.
- **API role hardening** â€” staff-only routes now use `withStaff` (patient_api â†' 403): `api/staff(+[id])`, `api/patients(+[id])` (portal uses new `GET /api/patients/me` instead), `api/expenses(+[id])`, `api/other-income(+[id])`, `api/lab-tests(+[id])`, `api/medical-records` POST + `[id]`, `api/invoices` POST + `[id]` PUT/DELETE, `api/prescriptions` POST + `[id]` PUT, `api/lab-orders` POST + `[id]`, `api/appointments/[id]` DELETE. `api/dependants/[id]` PUT/DELETE gained the same family-scope guard as GET.
- **Cross-tenant isolation smoke-tested** â€” tenant A "Smoke Test Clinic" (smoketest@skycare.app, pt.*@skycare.app patients) vs tenant B "Isolation Test Clinic" (iso-123754, iso.123754@skycare.app / iso.pt123754@skycare.app): lists return own rows only; by-id reads across tenants â†' 404; patient calling staff endpoints â†' 403. Session cookies for API smoke tests are `sb-pvakwxeusbxesdealuuc-auth-token` = `base64-<base64url(JSON session)>` (see `C:\Users\Admin\AppData\Local\Temp\opencode\smoke-patient.ps1` / `smoke-isolation.ps1`).
- **Settings** â€” `/app/settings` (hospital_admin/super_admin; last `soon` nav item flipped off): Hospital profile (name/email/phone/address/city/state/country), Branding & locale (brand color hex, currency, timezone), Staff & patient numbering (patient/dependant/staff/invoice prefixes validated by `PREFIX_PATTERN` + `normalizePrefix`, SMS provider, labAutoFill). API: `PUT /api/tenant-settings` (admin-only; validates profile fields; merges prefix/sms/labAutoFill into `tenants.settings` JSONB preserving unknown keys; writes audit entry) and `GET /api/tenant-settings` (admin-only; returns profile + raw settings JSONB; UI fills defaults from `DEFAULT_TENANT_SETTINGS`).
- **Settings smoke-tested on prod**: unauth 401, patient 403, admin 200 + PUT round-trip (brand/prefix/sms/labAutoFill persist; other tenant untouched), `/app/settings` page redirects patients to /login (layout guard).
- **Expenses + Other income** â€” `/app/expenses` and `/app/other-income` (ADMIN nav items): month picker, summary cards, search + category filter, add/edit/delete dialogs, camelCase bodies to `/api/expenses(+[id])` and `/api/other-income(+[id])` (note: [id] PUT takes snake_case keys). Shared `components/dashboard/finance-view.tsx` (kind prop).
- **Profile** â€” `/app/profile` (all staff; topbar avatar links to it): avatar upload (`POST /api/uploads/avatar` to public `avatars` bucket, 2 MB cap, PNG/JPG/WebP/GIF, own-folder storage policies in migration 0010), edit name/phone (`PUT /api/auth/me` now also defines PUT alongside the existing GET), change password (`POST /api/auth/change-password` verifies current via signInWithPassword then updateUser; min 8 chars).
- **Internal mail** â€” `/app/mail` (ADMIN): tabs Inbox/Sent/Compose; broadcast-to-staff; sidebar unread badge via `UnreadMailBadge` polling `/api/mail/unread-count` every 30s. APIs: `GET/POST /api/mail/inbox`, `GET /api/mail/sent`, `GET /api/mail/recipients` (staff/patients), `PUT /api/mail/[recipientRowId]/read` (all `withAuth` since patient portal v2 — see below; staff compose still allows broadcast, patients cannot). Inserts into `internal_messages`+`internal_message_recipients`, notifies recipients, tenant-validates recipients.
- **Chats** â€” `/app/chats` (ADMIN): staffâ†"patient messaging; two-pane list+thread, presence dots, directory of portal patients for new chats, 5s message polling. APIs: `GET/POST /api/chats`, `GET/POST /api/chats/[chatId]/messages`, `POST /api/chat-presence` heartbeat (patient_api now supported since patient portal v2 — see below). Notifies the receiving party's user_id.
- **Medical reports** â€” `/app/reports` (clinical ADMINS/doctor/nurse; write = hospital_admin/super_admin/doctor): grouped-by-date list, `<details>` expand, new-report dialog. `GET/POST /api/medical-reports` (tenant-scoped `MR-####` numbering; patient_api reads own family only; READ_ROLES clinical, WRITE_ROLES admin+doctor).
- **Patient portal v2 — records + profile + receipts** â€” `/patient/records` (medical records + doctor notes + medical reports, grouped, expandable; confidential doctor notes hidden from patients via `is_confidential = false` filter in the SERVICE client — RLS does the same for direct reads, use both), `/patient/profile` (avatar upload, edit name/phone via `PUT /api/auth/me`, edit date_of_birth/marital_status/blood_group/genotype/medical_plan/address via new `PUT /api/patients/me` with enum validation, change password, sign out), `/patient/receipt/[id]` (printable invoice+payments proof; reachable via "View receipt" link added to the billing page). Doctor notes API: `GET/POST /api/doctor-notes` (READ_ROLES clinical w/ required patient_id; patient_api family-scoped, non-confidential only; WRITE_ROLES clinical; doctor_id + created_by FK hints on user embed).
- **Patient portal v2 — chats + mail** â€” `patient-nav.ts` now has 10 items (added Medical records, Chats, Messages, Profile). Chats APIs extended for patient_api: `GET/POST /api/chats` (patient sees chats whose patient_id is in their family; directory = active staff of tenant; POST body `staffUserId`), `GET/POST /api/chats/[chatId]/messages` (getChat is role-aware: staff â†' staff_user_id = me, patient â†' patient_id in family; patient send notifies staff_user_id, staff send notifies patient). Mail APIs relaxed from `withStaff` to `withAuth`: `GET/POST /api/mail/inbox`, `GET /api/mail/sent`, `GET /api/mail/recipients` (for patient_api returns `patients: []` only staff), `GET /api/mail/unread-count`, `PUT /api/mail/[recipientRowId]/read` — queries are all recipient/sender-scoped so no extra isolation needed; patient POST cannot broadcast and recipients are filtered to staff roles. Patient portal UI: `components/patient/patient-chats.tsx` (own user id pulled from `/api/auth/me` for bubble side), `patient-mail.tsx` (Inbox/Sent/Compose to staff only). Smoke-verified end-to-end incl. staffâ†"patient both directions + unread/read flags + presence.
- **Route param gotcha**: dynamic segments NOT at the end of a route (e.g. `/api/chats/[chatId]/messages`, `/api/mail/[id]/read`) have the id in the second-to-last path segment â€" use `split("/").filter(Boolean)` and index `[len-2]`, NOT `.pop()`.
- **Build**: `npm run build` (frontend) passes; prod server runs `next start -p 3000` (find PID via `Get-NetTCPConnection -LocalPort 3000`). If `next start` reports "Could not find a production build", `.next` was emptied (e.g. interrupted build) â€" re-run `npm run build`.

### Active
- (none)

### Blocked
- (none)

## Commands

- Build/typecheck: `npm run build` in `frontend\` (production build also compiles all API routes).
- Dev server: `npm run dev` (port 3001 historically).
- Prod restart: kill PID listening on :3000, then `Start-Process node node_modules\next\dist\bin\next start -p 3000` (working dir `frontend`).
- DB: from `backend\supabase` run `npx supabase db push` (CLI logged in; linked prod ref).
- Verify routes: `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/...` â€” unauth API routes should return 401, protected pages 307 â†’ /login.
- PostgREST probes (join shapes, RLS): `curl -H "apikey: $SVC_KEY" -H "Authorization: Bearer $SVC_KEY" "$SUPA_URL/rest/v1/..."` â€” read keys from `frontend/.env.local`.
- Leave `skycare--saas--hosp.txt` at repo root alone (user instruction).
