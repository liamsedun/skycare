-- 0089_tenant_website_cms.sql
-- PHASE 1: tenant website/data layer for the multi-tenant website engine.
-- Pattern mirrors landing_doctors (0008/0011):
--   * tenant_id on every row, ON DELETE CASCADE from tenants
--   * RLS enabled; tenant-scoped staff/admin policies
--   * NO anon grants — public reads happen server-side via the service client
--     ([slug] pages), never via anon PostgREST.
-- Plus `tenants.subscription_status` for the subscription lifecycle (Phase 5).

-- ---------------------------------------------------------------------------
-- Subscription status enum + column
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_subscription_status') THEN
    CREATE TYPE tenant_subscription_status AS ENUM ('trial','active','past_due','suspended','cancelled');
  END IF;
END$$;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS subscription_status tenant_subscription_status NOT NULL DEFAULT 'trial';

-- ---------------------------------------------------------------------------
-- website_services — repeatable content: kills the hard-coded services grid
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS website_services (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  icon          text,
  image_url     text,
  display_order integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_website_services_tenant ON website_services (tenant_id, active, display_order);

ALTER TABLE website_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_services_tenant ON website_services FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY website_services_admin ON website_services
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()));

-- ---------------------------------------------------------------------------
-- website_departments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS website_departments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text,
  icon          text,
  image_url     text,
  display_order integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_website_departments_tenant ON website_departments (tenant_id, active, display_order);

ALTER TABLE website_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_departments_tenant ON website_departments FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY website_departments_admin ON website_departments
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()));

-- ---------------------------------------------------------------------------
-- website_pages — CMS content pages (about/services/contact/... keyed by slug)
-- content JSONB holds page sections; seo_title/description override defaults
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS website_pages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug           text NOT NULL,
  title          text NOT NULL,
  content        jsonb NOT NULL DEFAULT '{}'::jsonb,
  seo_title      text,
  seo_description text,
  published      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_website_pages_tenant_slug UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_website_pages_tenant ON website_pages (tenant_id, published);

ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY website_pages_tenant ON website_pages FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY website_pages_admin ON website_pages
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()));

-- ---------------------------------------------------------------------------
-- tenant_domains — claim-only custom domain management (Phase 6).
-- The ACTIVE primary domain is mirrored into tenants.domain (existing resolver
-- reads it); this table is the full claimed-domain list.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_domains (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain              text NOT NULL,
  is_primary          boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'verified',
  ssl_status          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_domains_domain UNIQUE (domain)
);
CREATE INDEX IF NOT EXISTS idx_tenant_domains_tenant ON tenant_domains (tenant_id);

ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_domains_tenant ON tenant_domains FOR SELECT
  USING (tenant_id = get_tenant_id() AND (is_staff() OR is_super_admin()));
CREATE POLICY tenant_domains_admin ON tenant_domains
  USING (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()))
  WITH CHECK (tenant_id = get_tenant_id() AND (is_hospital_admin() OR is_super_admin()));

-- ---------------------------------------------------------------------------
-- Grants: authenticated in-tenant users may read the CMS tables via RLS.
-- No anon grants anywhere (public reads are service-client only).
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.website_services, public.website_departments, public.website_pages, public.tenant_domains TO authenticated;