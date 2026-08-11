-- ============================================================================
-- 0064 — MODULE ACCESS LEVELS
-- users.module_access becomes a jsonb map of nav key -> access level:
--   {"pharmacy": "full", "patients": "view_only"}
--   Missing key  = none (hidden)
--   NULL record  = role default (all role-allowed modules)
-- Existing 0063 text[] entries are preserved and treated as "full".
-- ============================================================================

BEGIN;

-- 1. text[] -> jsonb (temporarily an ARRAY, preserving existing entries)
ALTER TABLE public.users
  ALTER COLUMN module_access TYPE jsonb
  USING (CASE WHEN module_access IS NULL THEN NULL ELSE to_jsonb(module_access) END);

-- 2. array entries {k1,k2} -> object {"k1":"full","k2":"full"}
UPDATE public.users
SET module_access = sub.obj
FROM (
  SELECT id,
         (SELECT jsonb_object_agg(e, 'full') FROM jsonb_array_elements_text(module_access) e) AS obj
  FROM public.users
  WHERE module_access IS NOT NULL
    AND jsonb_typeof(module_access) = 'array'
) sub
WHERE users.id = sub.id;

COMMENT ON COLUMN public.users.module_access IS
  'Per-user module access levels keyed by nav key: "full" or "view_only". Missing key = none; NULL = role default.';

COMMIT;
