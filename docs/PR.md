# SkyCare HMS SaaS — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** August 22, 2026  
**Owner:** Skyhouse Technologies  
**Status:** Active Development (~82% Complete)

---

## 1. Product Vision

SkyCare is a **multi-tenant Hospital Management System (HMS)** delivered as a SaaS platform. Every subscribing hospital gets:
- A branded **staff dashboard** (`/app/*`)
- A **patient portal** (`/patient/*`)
- A **public hospital website** (`<slug>.skycare.app`)
- A **mobile-first PWA** installable on any device

Built ground-up for the **African healthcare market** with native Nigerian payroll, Naira payments, NAFDAC compliance, and timezone handling.

---

## 2. Target Users

| User | Role | Access |
|------|------|--------|
| Hospital Administrator | `hospital_admin` | Full staff dashboard, settings, billing, HR, reports |
| Doctor | `doctor` | Clinical: patients, appointments, prescriptions, lab, notes |
| Nurse | `nurse` | Clinical: patients, appointments, rounds, ward |
| Pharmacist | `pharmacist` | Pharmacy: inventory, dispensing, compliance, billing |
| Lab Technician | `lab_tech` | Laboratory: orders, results, services |
| Cashier | `cashier` | Billing: invoices, payments, banking |
| HR Officer | `hr_officer` | HR: staff, payroll, roster, attendance, leave |
| Receptionist | `receptionist` | Front desk: appointments, patients |
| Patient | `patient_api` | Patient portal: appointments, bills, results, family |
| Super Admin | `super_admin` | Cross-tenant platform management |

---

## 3. Module Requirements

### 3.1 Patient Management ✅ COMPLETE
- Auto-generated patient numbers (`PT-XXXX`)
- CSV import/export with 25+ columns
- Family model: primary holder + up to 5 dependants
- Relationship tracking (Child, Spouse, Parent, Sibling, Grandparent, Other)
- Profile photo upload
- Medical records, doctor notes, lab results
- Portal login provisioning (admin can create/reset)
- Deactivate/Activate/Soft-delete

### 3.2 Appointments ✅ COMPLETE
- Create with patient/doctor/type/date/time/reason
- Status flow: scheduled → confirmed → in_progress → completed / cancelled
- Patient portal self-booking with family member picker
- Notifications on status changes
- Upcoming/Past segmented views

### 3.3 Pharmacy ✅ COMPLETE
- Drug catalogue with categories, forms, NAFDAC numbers
- Batch tracking (FEFO — First Expiry First Out)
- Low-stock alerts, expiry warnings
- Per-item dispensing with auto status updates
- Branch-aware pricing (overrides per branch)
- Supplier management + purchase orders + GRNs
- Opening balance import via CSV
- Controlled drug register (append-only, hash-chained)
- NAFDAC compliance reports
- Insurance claims
- Drug CSV import with dry-run conflict resolution

### 3.4 AI Pharmacy Engine ✅ COMPLETE
- Demand Forecasting (30/90-day predictions)
- Drug Recommendations (diagnosis-based)
- Drug Interactions (dangerous combination detection)
- Drug Alternatives (same-category substitutions)
- Smart Pricing (Nigeria retail margin bands)
- Anomaly Detection (spikes, outliers, duplicates)
- Auto Reorder (PO suggestions from forecasts)
- Full AI Sweep (one-call: forecast + anomaly + reorder)

### 3.5 Laboratory ✅ COMPLETE
- Test catalogue with categories
- Order creation and status tracking
- Per-test results with abnormal flags
- Walk-in payments
- Service income tracking
- CSV import with upsert

### 3.6 Wards ✅ COMPLETE
- 7 ward types (General, Private, ICU, Maternity, Surgical, Pediatric, Observation)
- Bed management with status (Available/Occupied/Maintenance/Cleaning)
- Admissions and discharges
- Ward rounds
- AI occupancy forecasting (7-day projection)
- Visual bed map with date range filtering

### 3.7 Billing & Payments ✅ COMPLETE
- Dynamic invoicing with VAT/discount
- Auto-generated invoice numbers (`INV-XXXX`)
- Multi-invoice payment allocation
- Pending declaration confirm/decline
- Online payments via Paystack (card + bank transfer)
- Offline fallback (bank transfer, POS, cash)
- Branded PDF print with letterhead

### 3.8 Banking ✅ COMPLETE
- Multi-account management (max 5)
- Internal transfers between accounts
- Opening balances
- Per-account statements with daily summaries
- Reconciliation
- Payroll auto-posting
- CSV export + letterhead print

### 3.9 Expenses & Other Income ✅ COMPLETE
- Category-based tracking
- "Pay from account" / "Deposit into" bank selectors
- Month picker, search, filters
- CSV import
- Ledger posting to chosen accounts

### 3.10 HR Module ✅ COMPLETE
- Staff profiles with employment details
- Shift templates (CRUD, color, active toggle)
- Roster management (5 views: Per Day/Staff/Week/Month/List)
- Bulk shift assignment
- Bulk status actions (complete/cancel/delete)
- Attendance clock in/out
- Leave management (7 types with configurable entitlements)
- Credential tracking with expiry alerts
- HR CSV import (25 columns)

### 3.11 Payroll ✅ COMPLETE
- Nigerian payroll engine (SkyBooks-ported)
- PAYE 6-band tax computation
- Pension (EE 8% + ER 10%), NHIS (5% EE + 10% ER), NHF (2.5%)
- Tax reliefs (rent, mortgage, life assurance)
- Salary structure (basic/housing/transport/utilities/meals/others as % of gross)
- Payslips with earnings/deductions/statutory
- PAYE Schedule, Pension Schedule (CSV + letterhead print)
- Run payroll → Approve → Pay (ledger post)
- Bulk approve/delete/edit drafts
- Year-level summary API

### 3.12 Internal Mail ✅ COMPLETE
- Inbox/Sent/Compose
- Broadcast to all staff, all patients, or both
- Individual recipient selection with search
- Patient resolution via family members for login-less accounts
- Collapsible sent messages
- Delete with cascade
- Unread badge with 30s polling

### 3.13 Chats ✅ COMPLETE
- Staff-patient two-way messaging
- Staff-to-staff messaging
- Presence indicators (online/offline)
- File attachments (images, docs, audio)
- 5-second polling
- Patient portal integration

### 3.14 Financial Reports ✅ COMPLETE
- P&L Statement (16+ expense lines)
- Income by Services breakdown
- Payroll by department
- 12-month revenue trends (line chart)
- Income-by-source pie chart
- Date range filtering
- CSV export + letterhead print
- Mobile card layout

### 3.15 Audit & Security ✅ COMPLETE
- Full audit trail with column-level diff
- Security events monitoring
- Rate limiting (100 req/min standard, 10 req/min auth)
- Login lockout (5 attempts / 15 min)
- CSP headers, X-Frame-Options DENY, nosniff
- Cross-tenant isolation verified by smoke tests
- Function EXECUTE hardening (migrations 0097/0100)

### 3.16 Settings ✅ COMPLETE
- Hospital profile, branding, locale
- Numbering prefixes (patient/dependant/staff/invoice)
- SMS provider config
- Paystack payment keys (secrets never leave server)
- Website setup (provision, toggle, counts)
- System backup/reset/restore

### 3.17 Subscription Management ✅ COMPLETE
- Plans: basic, pro, enterprise, custom
- Status lifecycle: trial → active → suspended → past_due → cancelled
- Admin lifecycle actions (activate/suspend/resume/cancel)
- Plan change
- Billing invoices history
- Public suspended banner

### 3.18 Public Hospital Website ✅ COMPLETE
- Auto-provisioned on signup
- Pages: Home, About, Services, Departments, Doctors, Contact, Book, Login
- CMS-managed content (services, departments, doctors)
- SEO: sitemap.xml, meta tags, favicon
- Google Maps integration
- WhatsApp contact
- Opening hours & social links
- Onboarding wizard (4-step)

### 3.19 Patient Portal ✅ COMPLETE
- Dashboard with stats, charts, appointments, bills
- Self-booking, bill payment, result viewing
- Family management (add/edit/remove dependants)
- Medical records (editable own non-confidential notes)
- Chats with staff
- Internal mail (inbox/sent/compose to staff)
- Notifications (All/Unread, mark-all-read)
- Profile with avatar upload
- Account preferences (theme)
- PWA install prompt
- Mobile-first bottom navigation

### 3.20 Staff Dashboard ✅ COMPLETE
- Overview with KPI cards, charts, schedule
- All 15+ module pages with search/filter
- Dark mode ("Dusk & Gold" theme)
- Mobile bottom navigation with More FAB
- Per-user module access grants (full/view_only/none)

### 3.21 Authentication & Authorization ✅ COMPLETE
- 25 staff roles with JWT claims
- OAuth: Google + Yahoo (custom OIDC)
- Per-user module access grants
- Role-based API guards
- Idle auto-logout (15 min)
- Account lockout detection

### 3.22 Multi-Tenancy ✅ COMPLETE
- Isolated data via PostgreSQL RLS
- Subdomain routing (`<slug>.skycare.app`)
- Custom domain support
- Auto-subdomain generation from hospital name
- Tenant public profile view (safe fields only)

### 3.23 PWA & Mobile ✅ COMPLETE
- Service worker, web app manifest
- Installable on mobile devices
- Staff bottom navigation (6 tabs + More FAB with 17 tiles)
- Patient bottom navigation (5 tabs + More FAB with 7 tiles)
- Mobile-optimized layouts across all pages
- Dark mode support

### 3.24 System Backup/Reset/Restore ✅ COMPLETE
- Full JSON backup (20+ tables)
- Reset (wipe data, keep config)
- Restore (version validation, FK remapping, auth recreation)

---

## 4. Outstanding / Future Work

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| **SMS Integration** | High | Not Started | SMS provider config exists, no sending logic |
| **Email Notifications** | High | Not Started | Internal mail exists, no external email |
| **Insurance Claims (full)** | Medium | Partial | Schema exists, UI/API minimal |
| **Telemedicine** | Medium | Not Started | Video consultations |
| **Prescription PDF download** | Low | Complete | Server-generated, stored in bucket |
| **Mobile native apps** | Low | Not Started | PWA covers most use cases |
| **Multi-language (i18n)** | Low | Not Started | English only |
| **Custom domain provisioning** | Medium | Partial | Schema exists, no auto-DNS |
| **Advanced analytics** | Medium | Partial | Basic charts, no ML beyond pharmacy AI |
| **Staff scheduling optimization** | Low | Not Started | Current roster is manual |
| **Patient portal appointment reschedule** | Low | Not Started | Cancel only, no reschedule API |
| **Lab result PDF export** | Low | Not Started | Screen view only |
| **Pharmacy batch barcode printing** | Low | Not Started | Manual batch entry |
| **Audit log archival** | Low | Not Started | Logs grow unbounded |
| **Performance monitoring (APM)** | Medium | Partial | Sentry configured, no dashboards |
| **E2E test suite** | Medium | Not Started | Unit/integration tests exist |

---

## 5. Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Build passes | 0 errors | ✅ 0 errors |
| Lint | 0 errors, ≤602 warnings | ✅ 0 errors, ~602 warnings |
| TypeCheck | 0 errors | ✅ 0 errors |
| Unit tests | 206+ passing | ✅ 206+ passing |
| Coverage gate | ≥25% statements | ✅ ~29% |
| Database migrations | 103 applied | ✅ 103 |
| API routes | 150+ endpoints | ✅ 150+ |
| Pages | 50+ pages | ✅ 50+ |
| Smoke tests | Passing against prod | ✅ Passing |

---

## 6. Release History

| Version | Date | Changes |
|---------|------|---------|
| v0.1.0 | Aug 2026 | Initial release: multi-tenant HMS, patient portal, public website, pharmacy AI, HR/payroll, banking, billing, chats, mail, dark mode, PWA |
