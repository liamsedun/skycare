-- 0107_platform_batch2.sql
-- Support Tickets, Announcements, Feature Rollouts

-- 1. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  message text NOT NULL,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','billing','technical','feature_request','bug')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  resolution text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_tenant ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_st_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_st_assigned ON support_tickets(assigned_to);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tm_ticket ON ticket_messages(ticket_id);

-- 2. Platform Announcements
CREATE TABLE IF NOT EXISTS platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info'
    CHECK (type IN ('info','warning','important','maintenance')),
  is_global boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_dismissable boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pa_tenant ON platform_announcements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pa_active ON platform_announcements(starts_at, ends_at);

-- 3. Feature Rollouts
CREATE TABLE IF NOT EXISTS feature_rollouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  rollout_percent integer NOT NULL DEFAULT 0
    CHECK (rollout_percent >= 0 AND rollout_percent <= 100),
  is_active boolean NOT NULL DEFAULT false,
  allowlist_tenant_ids uuid[] DEFAULT '{}',
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fr_key ON feature_rollouts(feature_key);
CREATE INDEX IF NOT EXISTS idx_fr_active ON feature_rollouts(is_active);

CREATE TABLE IF NOT EXISTS feature_rollout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rollout_id uuid NOT NULL REFERENCES feature_rollouts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fre_rollout ON feature_rollout_events(rollout_id);
CREATE INDEX IF NOT EXISTS idx_fre_tenant ON feature_rollout_events(tenant_id);

-- RLS: platform admins for support (cross-tenant), tenant-scoped for own tickets
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_rollouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_rollout_events ENABLE ROW LEVEL SECURITY;

-- Support: platform admins see all, tenants see their own
DROP POLICY IF EXISTS "support_tickets_admin_all" ON support_tickets;
CREATE POLICY "support_tickets_admin_all" ON support_tickets
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

DROP POLICY IF EXISTS "support_tickets_tenant_read" ON support_tickets;
CREATE POLICY "support_tickets_tenant_read" ON support_tickets
  FOR SELECT USING (tenant_id = get_tenant_id());

DROP POLICY IF EXISTS "support_tickets_tenant_insert" ON support_tickets;
CREATE POLICY "support_tickets_tenant_insert" ON support_tickets
  FOR INSERT WITH CHECK (tenant_id = get_tenant_id());

-- Ticket messages: via service role only
DROP POLICY IF EXISTS "ticket_messages_service" ON ticket_messages;
CREATE POLICY "ticket_messages_service" ON ticket_messages
  FOR ALL USING (auth.role() = 'service_role');

-- Announcements: platform admins manage, tenants read
DROP POLICY IF EXISTS "announcements_admin_all" ON platform_announcements;
CREATE POLICY "announcements_admin_all" ON platform_announcements
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

DROP POLICY IF EXISTS "announcements_public_read" ON platform_announcements;
CREATE POLICY "announcements_public_read" ON platform_announcements
  FOR SELECT USING (true);

-- Feature rollouts: platform admins only
DROP POLICY IF EXISTS "rollouts_admin_all" ON feature_rollouts;
CREATE POLICY "rollouts_admin_all" ON feature_rollouts
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

DROP POLICY IF EXISTS "rollout_events_admin_all" ON feature_rollout_events;
CREATE POLICY "rollout_events_admin_all" ON feature_rollout_events
  FOR ALL USING (
    auth.jwt()->'app_metadata'->>'role' = 'super_admin'
    AND auth.jwt()->'app_metadata'->'tenant_id' IS NULL
  );

-- Grants
GRANT ALL ON support_tickets TO service_role;
GRANT ALL ON ticket_messages TO service_role;
GRANT ALL ON platform_announcements TO service_role;
GRANT ALL ON feature_rollouts TO service_role;
GRANT ALL ON feature_rollout_events TO service_role;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_tickets_updated_at();

CREATE OR REPLACE FUNCTION update_feature_rollouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feature_rollouts_updated_at ON feature_rollouts;
CREATE TRIGGER trg_feature_rollouts_updated_at
  BEFORE UPDATE ON feature_rollouts
  FOR EACH ROW EXECUTE FUNCTION update_feature_rollouts_updated_at();
