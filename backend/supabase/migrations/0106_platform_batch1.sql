-- 0106_platform_batch1.sql
-- Subscription Plans, Platform Config, Platform Audit Logs

-- 1. Subscription Plans (platform-level plan definitions)
CREATE TABLE IF NOT EXISTS platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text DEFAULT '',
  monthly_price numeric(14,2) NOT NULL DEFAULT 0,
  annual_price numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  trial_days integer NOT NULL DEFAULT 0,
  -- Limits
  user_limit integer NOT NULL DEFAULT 1,
  storage_limit_gb integer NOT NULL DEFAULT 1,
  patient_limit integer NOT NULL DEFAULT 100,
  branch_limit integer NOT NULL DEFAULT 1,
  -- Feature flags
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Display
  popular_badge boolean NOT NULL DEFAULT false,
  recommended_badge boolean NOT NULL DEFAULT false,
  ribbon_color text,
  button_text text NOT NULL DEFAULT 'Subscribe',
  sort_order integer NOT NULL DEFAULT 0,
  -- Status
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_plans_active ON platform_plans(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_platform_plans_code ON platform_plans(code);

-- Seed default plans
INSERT INTO platform_plans (name, code, description, monthly_price, annual_price, trial_days, user_limit, storage_limit_gb, patient_limit, branch_limit, modules, popular_badge, sort_order) VALUES
  ('Basic', 'basic', 'For small clinics and single-doctor practices', 25000, 250000, 14, 5, 5, 500, 1, '[]', false, 1),
  ('Pro', 'pro', 'For growing hospitals with multiple departments', 75000, 750000, 14, 25, 50, 5000, 5, '["pharmacy","lab","hr"]', true, 2),
  ('Enterprise', 'enterprise', 'For large hospital networks and teaching hospitals', 200000, 2000000, 14, 100, 200, 50000, 50, '["pharmacy","lab","hr","analytics","ai"]', false, 3)
ON CONFLICT (code) DO NOTHING;

-- 2. Platform Config (key-value store for system settings)
CREATE TABLE IF NOT EXISTS platform_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text DEFAULT '',
  category text DEFAULT 'general',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed defaults
INSERT INTO platform_config (key, value, description, category) VALUES
  ('platform_name', '"SkyCare"', 'Platform display name', 'branding'),
  ('support_email', '"support@skycare.app"', 'Support contact email', 'branding'),
  ('trial_duration_days', '14', 'Default trial duration in days', 'subscriptions'),
  ('default_plan', '"basic"', 'Default plan for new tenants', 'subscriptions'),
  ('backup_enabled', 'true', 'Enable automated backups', 'system'),
  ('backup_retention_days', '30', 'Days to retain backups', 'system'),
  ('data_retention_days', '365', 'Days to retain audit data', 'system'),
  ('maintenance_mode', 'false', 'Platform maintenance mode', 'system'),
  ('max_tenants', '100', 'Maximum number of tenants', 'system'),
  ('email_notifications', 'true', 'Enable email notifications', 'notifications')
ON CONFLICT (key) DO NOTHING;

-- 3. Platform Audit Logs (cross-tenant platform-level audit)
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  description text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_action ON platform_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_platform_audit_entity ON platform_audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_platform_audit_user ON platform_audit_logs(user_id);

-- RLS: platform admins only
ALTER TABLE platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;

-- Plans: anyone can read active public plans, platform admins can do everything
DROP POLICY IF EXISTS "platform_plans_public_read" ON platform_plans;
CREATE POLICY "platform_plans_public_read" ON platform_plans
  FOR SELECT USING (is_active = true AND is_public = true);

DROP POLICY IF EXISTS "platform_plans_admin_all" ON platform_plans;
CREATE POLICY "platform_plans_admin_all" ON platform_plans
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

-- Config: platform admins only
DROP POLICY IF EXISTS "platform_config_admin_all" ON platform_config;
CREATE POLICY "platform_config_admin_all" ON platform_config
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

-- Audit logs: platform admins only
DROP POLICY IF EXISTS "platform_audit_admin_all" ON platform_audit_logs;
CREATE POLICY "platform_audit_admin_all" ON platform_audit_logs
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

-- Grants
GRANT SELECT ON platform_plans TO anon, authenticated;
GRANT ALL ON platform_plans TO service_role;
GRANT ALL ON platform_config TO service_role;
GRANT ALL ON platform_audit_logs TO service_role;

-- Updated_at trigger for plans
CREATE OR REPLACE FUNCTION update_platform_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_plans_updated_at ON platform_plans;
CREATE TRIGGER trg_platform_plans_updated_at
  BEFORE UPDATE ON platform_plans
  FOR EACH ROW EXECUTE FUNCTION update_platform_plans_updated_at();
