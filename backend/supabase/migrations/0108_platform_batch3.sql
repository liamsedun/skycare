-- 0108_platform_batch3.sql
-- RBAC, System Health extensions, SaaS Analytics

-- 1. Platform Role Permissions (RBAC)
CREATE TABLE IF NOT EXISTS platform_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL UNIQUE,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed built-in roles
INSERT INTO platform_role_permissions (role, permissions) VALUES
  ('super_admin', ARRAY[
    'tenants:read','tenants:manage',
    'plans:read','plans:manage',
    'billing:read','billing:manage',
    'coupons:read','coupons:manage',
    'analytics:read','growth:read',
    'system:read','system:manage',
    'feature_flags:manage','audit_logs:read',
    'support:read','support:manage',
    'announcements:manage',
    'users:read','users:create','users:update','users:delete',
    'api_keys:manage','impersonation:use'
  ]),
  ('admin', ARRAY[
    'tenants:read','tenants:manage',
    'plans:read','plans:manage',
    'billing:read','billing:manage',
    'coupons:read','coupons:manage',
    'analytics:read','growth:read',
    'system:read','system:manage',
    'feature_flags:manage','audit_logs:read',
    'support:read','support:manage',
    'announcements:manage',
    'users:read','users:create','users:update'
  ]),
  ('support_manager', ARRAY[
    'tenants:read','support:read','support:manage',
    'users:read','audit_logs:read'
  ]),
  ('analyst', ARRAY[
    'tenants:read','analytics:read','growth:read',
    'billing:read','audit_logs:read'
  ]),
  ('billing_manager', ARRAY[
    'tenants:read','plans:read','billing:read','billing:manage',
    'coupons:read','coupons:manage'
  ]),
  ('viewer', ARRAY[
    'tenants:read','plans:read','billing:read',
    'analytics:read','audit_logs:read'
  ])
ON CONFLICT (role) DO NOTHING;

-- 2. Platform system health metrics table
CREATE TABLE IF NOT EXISTS platform_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','warning','error')),
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phc_name ON platform_health_checks(check_name);
CREATE INDEX IF NOT EXISTS idx_phc_checked ON platform_health_checks(checked_at);

-- 3. Platform API usage tracking
CREATE TABLE IF NOT EXISTS platform_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer,
  response_time_ms integer,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pau_tenant ON platform_api_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pau_called ON platform_api_usage(called_at);

-- RLS
ALTER TABLE platform_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_api_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_perms_admin_all" ON platform_role_permissions;
CREATE POLICY "role_perms_admin_all" ON platform_role_permissions
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

DROP POLICY IF EXISTS "health_checks_admin_all" ON platform_health_checks;
CREATE POLICY "health_checks_admin_all" ON platform_health_checks
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

DROP POLICY IF EXISTS "api_usage_admin_all" ON platform_api_usage;
CREATE POLICY "api_usage_admin_all" ON platform_api_usage
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

GRANT ALL ON platform_role_permissions TO service_role;
GRANT ALL ON platform_health_checks TO service_role;
GRANT ALL ON platform_api_usage TO service_role;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_platform_role_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_role_permissions_updated_at ON platform_role_permissions;
CREATE TRIGGER trg_platform_role_permissions_updated_at
  BEFORE UPDATE ON platform_role_permissions
  FOR EACH ROW EXECUTE FUNCTION update_platform_role_permissions_updated_at();
