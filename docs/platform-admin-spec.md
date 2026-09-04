# SkyCare SaaS Platform Admin Portal — Feature Spec

## Overview
Build the SkyCare SaaS main admin portal for managing all tenants, subscriptions, payments, coupons, and free trials. This is the **platform-level** admin, NOT the hospital-level admin.

## Access
- Route: `/platform` (protected by `super_admin` role only)
- API: all under `/api/platform/*` (requires `super_admin` + `tenantId === null`)

## Feature Breakdown

### 1. Platform Dashboard
- Total tenants (active/trial/suspended/cancelled)
- MRR (Monthly Recurring Revenue) from subscription_invoices
- Revenue trend chart (12-month)
- New signups this month
- Trial conversion rate
- Quick links to tenants list, coupons, billing

### 2. Tenant Management
- **List all tenants** with filters (status, plan, search)
- **Tenant detail** view: profile, subscription status, plan, trial end, signup date, website enabled
- **Actions**: activate/suspend/cancel subscription, change plan, extend trial, toggle website
- **Create tenant** (manual provisioning)
- **Delete tenant** (with confirmation)

### 3. Subscription & Billing
- **Plan management**: define plans (basic/pro/enterprise/custom) with pricing
- **Generate invoices** for tenants (monthly/annual)
- **Record payments** (manual or Paystack)
- **Payment history** per tenant
- **Overdue tracking** (auto-flag past_due)

### 4. Coupon System
- **Create coupons**: code, discount (% or fixed), max uses, expiry, applicable plans
- **List/manage coupons**: activate/deactivate, view usage stats
- **Apply coupon** at tenant signup or plan change
- **Usage tracking**: which tenant used which coupon

### 5. Free Trial Management
- **Default trial duration** (configurable, e.g., 14 days)
- **Extend trial** for specific tenants
- **Trial expiration automation**: auto-suspend after trial ends
- **Trial conversion tracking**

### 6. Revenue Analytics
- MRR by plan
- Churn rate
- Trial-to-paid conversion
- Coupon usage impact
- Revenue by payment method

## Database Changes Needed

### New Tables
```sql
-- Coupons
CREATE TABLE platform_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric(10,2) NOT NULL,
  max_uses integer,
  used_count integer DEFAULT 0,
  applicable_plans tenant_plan[],
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Coupon usage
CREATE TABLE platform_coupon_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES platform_coupons(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  used_at timestamptz DEFAULT now(),
  invoice_id uuid REFERENCES subscription_invoices(id),
  UNIQUE(coupon_id, tenant_id)
);

-- Platform settings
CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz DEFAULT now()
);
```

### Extensions to Existing Tables
```sql
-- Add coupon_id to subscription_invoices
ALTER TABLE subscription_invoices ADD COLUMN coupon_id uuid REFERENCES platform_coupons(id);
ALTER TABLE subscription_invoices ADD COLUMN discount_amount numeric(12,2) DEFAULT 0;
```

## API Endpoints

### Platform Tenant Management
- `GET /api/platform/tenants` — list all tenants with stats
- `GET /api/platform/tenants/[id]` — tenant detail
- `PUT /api/platform/tenants/[id]` — update subscription/plan/status
- `DELETE /api/platform/tenants/[id]` — delete tenant

### Platform Billing
- `GET /api/platform/invoices` — all subscription invoices
- `POST /api/platform/invoices` — generate invoice for tenant
- `PUT /api/platform/invoices/[id]` — update payment status

### Platform Coupons
- `GET /api/platform/coupons` — list coupons
- `POST /api/platform/coupons` — create coupon
- `PUT /api/platform/coupons/[id]` — update coupon
- `DELETE /api/platform/coupons/[id]` — delete coupon

### Platform Analytics
- `GET /api/platform/dashboard` — aggregated stats
- `GET /api/platform/analytics/revenue` — revenue data

### Platform Settings
- `GET /api/platform/settings` — platform config
- `PUT /api/platform/settings` — update platform config

## UI Pages

### `/platform` — Dashboard
- Stats cards (tenants, MRR, trials, conversions)
- Revenue chart (recharts)
- Recent signups table
- Quick actions

### `/platform/tenants` — Tenant List
- Search/filter bar
- Tenant cards with status badges
- Quick actions (view, suspend, extend trial)

### `/platform/tenants/[id]` — Tenant Detail
- Profile card
- Subscription management
- Payment history
- Coupon usage
- Activity log

### `/platform/billing` — Billing Overview
- Invoice list with filters
- Generate invoice form
- Payment recording

### `/platform/coupons` — Coupon Management
- Coupon list with stats
- Create/edit coupon form
- Usage history

### `/platform/analytics` — Revenue Analytics
- MRR trend chart
- Plan distribution pie
- Churn metrics
- Coupon impact

## Implementation Order
1. Database migration (coupons table, platform_settings, invoice extensions)
2. Platform API routes (tenants, invoices, coupons, analytics)
3. Platform UI (dashboard → tenants → billing → coupons → analytics)
4. Trial expiration automation (cron or edge function)
5. Plan enforcement (feature gating)

## Technical Notes
- All platform routes use `withAuth` + `is_super_admin` check
- Platform admin has `tenantId === null` — queries are cross-tenant
- Use existing Paystack integration for payment processing
- Follow existing code patterns (service client, audit logging, error handling)
- RLS: platform admin bypasses tenant isolation via `is_super_admin()` helper
