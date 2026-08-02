# SkyCare API Surface

Edge Functions (`backend/supabase/functions`) + Postgres/PostgREST endpoints behind RLS.
The frontend talks to PostgREST directly (client key, RLS-scoped) for CRUD; edge
functions cover anything needing service-role, transactions, or external providers.

## Auth / platform

| Method | Path | Purpose |
|---|---|---|
| POST | `tenant-onboarding` | Hospital signup → tenant + branch + first admin |
| POST | `auth.login` *(optional)* | Username/password for legacy; primary = Supabase Auth |
| POST | `auth.refresh-claims` | Rewrite JWT app_metadata after role/branch change |
| POST | `platform.invite-user` | Add staff to tenant (sets role/branch, sends invite) |
| POST | `subscription.webhook` | Paystack/Flutterwave subscription webhook → `subscription_invoices` |

## Core CRUD (PostgREST — all RLS-scoped to `tenant_id`)

| Module | Tables | Notes |
|---|---|---|
| Register | `patients` | `patient_number` auto-gen on insert |
| Appointments | `appointments` | status flow via RPC `appointment_status_flow` |
| Clinical | `visits`, `medical_records` | EHR |
| Billing | `invoices`, `invoice_items`, `payments` | totals recomputed in trigger |
| Pharmacy | `drugs`, `drug_batches`, `stock_movements`, `prescriptions`, `prescription_items` | stock after `stock_movements` |
| Lab | `lab_tests`, `lab_orders`, `lab_order_tests`, `lab_results` | |
| Ward/Bed | `wards`, `beds`, `admissions` | |
| HR | `staff_roster`, `attendance`, `staff_leave` | |
| Stores | `suppliers`, `purchase_orders`, `po_items`, `goods_receipts`, `requisitions` | |
| Analytics | `analytics_daily`, `v_revenue_monthly`, `v_appointment_insights` | read-mostly |

## Recommended RPCs (to add next)

- `patients.register()` — transaction wrapper (number generation + insert + audit)
- `pharmacy.dispense()` — debit batch, increment dispensed_qty, append movement
- `billing.record_payment()` — insert payment + update invoice.paid_amount/status
- `lab.submit_result()` — post result + mark abnormal + notify
- `reports.sales_today()` — ready dashboard aggregates

## Response envelope
`{ "data": ..., "meta": { pagination } }` on success; `{ "error": code, "message" }`.