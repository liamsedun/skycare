-- 0104_platform_admin_portal.sql
-- SkyCare SaaS Platform Admin Portal: coupons, platform settings, invoice extensions

-- ============================================================
-- 1. PLATFORM COUPONS
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  max_uses integer CHECK (max_uses IS NULL OR max_uses > 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  applicable_plans tenant_plan[] DEFAULT '{}',
  min_amount numeric(12,2) DEFAULT 0 CHECK (min_amount >= 0),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_coupon_code_ci ON platform_coupons (lower(code));

-- ============================================================
-- 2. COUPON USAGE TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_coupon_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES platform_coupons(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES subscription_invoices(id) ON DELETE SET NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_usage_per_tenant ON platform_coupon_usage (coupon_id, tenant_id);

-- ============================================================
-- 3. PLATFORM SETTINGS (key-value store for platform config)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default platform settings
INSERT INTO platform_settings (key, value) VALUES
  ('trial_duration_days', '{"days": 14}'::jsonb),
  ('plans', '{
    "basic": {"name": "Basic", "monthly_price": 25000, "annual_price": 250000, "currency": "NGN"},
    "pro": {"name": "Pro", "monthly_price": 75000, "annual_price": 750000, "currency": "NGN"},
    "enterprise": {"name": "Enterprise", "monthly_price": 200000, "annual_price": 2000000, "currency": "NGN"},
    "custom": {"name": "Custom", "monthly_price": 0, "annual_price": 0, "currency": "NGN"}
  }'::jsonb),
  ('platform_name', '{"name": "SkyCare SaaS"}'::jsonb),
  ('auto_suspend_trials', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. EXTEND SUBSCRIPTION_INVOICES
-- ============================================================
ALTER TABLE subscription_invoices
  ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES platform_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) GENERATED ALWAYS AS (amount - discount_amount) STORED;

-- ============================================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_platform_coupon_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_coupons_updated_at ON platform_coupons;
CREATE TRIGGER trg_platform_coupons_updated_at
  BEFORE UPDATE ON platform_coupons
  FOR EACH ROW EXECUTE FUNCTION update_platform_coupon_timestamp();

DROP TRIGGER IF EXISTS trg_platform_settings_updated_at ON platform_settings;
CREATE TRIGGER trg_platform_settings_updated_at
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION update_platform_coupon_timestamp();

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================
ALTER TABLE platform_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Platform coupons: super_admin full access, hospital_admin read-only
DROP POLICY IF EXISTS coupons_super_admin_all ON platform_coupons;
CREATE POLICY coupons_super_admin_all ON platform_coupons
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS coupons_hospital_admin_read ON platform_coupons;
CREATE POLICY coupons_hospital_admin_read ON platform_coupons
  FOR SELECT USING (is_hospital_admin() OR is_staff());

-- Coupon usage: super_admin full, hospital_admin read own tenant
DROP POLICY IF EXISTS coupon_usage_super_admin_all ON platform_coupon_usage;
CREATE POLICY coupon_usage_super_admin_all ON platform_coupon_usage
  FOR ALL USING (is_super_admin());

DROP POLICY IF EXISTS coupon_usage_tenant_read ON platform_coupon_usage;
CREATE POLICY coupon_usage_tenant_read ON platform_coupon_usage
  FOR SELECT USING (tenant_id = get_tenant_id());

-- Platform settings: super_admin only
DROP POLICY IF EXISTS platform_settings_super_admin_all ON platform_settings;
CREATE POLICY platform_settings_super_admin_all ON platform_settings
  FOR ALL USING (is_super_admin());

-- ============================================================
-- 7. GRANTS
-- ============================================================
GRANT SELECT ON platform_coupons TO authenticated;
GRANT SELECT ON platform_coupon_usage TO authenticated;
GRANT SELECT ON platform_settings TO authenticated;
