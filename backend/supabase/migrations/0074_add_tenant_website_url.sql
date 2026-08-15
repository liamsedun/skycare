-- 0074: tenants.website_url — the hospital's own external website link, captured at signup
-- (the existing tenants.website jsonb remains the in-app website-generator content).
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS website_url text;