-- 0109_platform_batch4.sql
-- Impersonation, Dunning Pipeline, API Keys

-- 1. Impersonation Sessions
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id uuid NOT NULL REFERENCES public.users(id),
  super_admin_email text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  tenant_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  stopped_at timestamptz,
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','stopped'))
);

CREATE INDEX IF NOT EXISTS idx_imp_super ON impersonation_sessions(super_admin_id);
CREATE INDEX IF NOT EXISTS idx_imp_tenant ON impersonation_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imp_status ON impersonation_sessions(status);

-- 2. Dunning Runs
CREATE TABLE IF NOT EXISTS dunning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('warning','suspended','archived')),
  executed_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  response text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_dr_tenant ON dunning_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dr_stage ON dunning_runs(stage);
CREATE INDEX IF NOT EXISTS idx_dr_exec ON dunning_runs(executed_at);

-- 3. API Keys (per-tenant)
CREATE TABLE IF NOT EXISTS platform_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  prefix text NOT NULL,
  scopes text[] DEFAULT '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ak_tenant ON platform_api_keys(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ak_prefix ON platform_api_keys(prefix);

-- RLS
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dunning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_api_keys ENABLE ROW LEVEL SECURITY;

-- Impersonation: platform admins only
DROP POLICY IF EXISTS "imp_sessions_admin" ON impersonation_sessions;
CREATE POLICY "imp_sessions_admin" ON impersonation_sessions
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

-- Dunning: platform admins + tenant reads own
DROP POLICY IF EXISTS "dunning_admin_all" ON dunning_runs;
CREATE POLICY "dunning_admin_all" ON dunning_runs
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

DROP POLICY IF EXISTS "dunning_tenant_read" ON dunning_runs;
CREATE POLICY "dunning_tenant_read" ON dunning_runs
  FOR SELECT USING (tenant_id = get_tenant_id());

-- API Keys: tenant admins manage own, platform admins see all
DROP POLICY IF EXISTS "api_keys_admin_all" ON platform_api_keys;
CREATE POLICY "api_keys_admin_all" ON platform_api_keys
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

DROP POLICY IF EXISTS "api_keys_tenant_manage" ON platform_api_keys;
CREATE POLICY "api_keys_tenant_manage" ON platform_api_keys
  FOR ALL USING (
    tenant_id = get_tenant_id()
    AND (is_hospital_admin() OR is_super_admin())
  );

GRANT ALL ON impersonation_sessions TO service_role;
GRANT ALL ON dunning_runs TO service_role;
GRANT ALL ON platform_api_keys TO service_role;
