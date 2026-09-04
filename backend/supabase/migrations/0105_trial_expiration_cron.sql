-- Migration: Auto-suspend expired trials
-- Creates a function that suspends tenants whose trial has passed

CREATE OR REPLACE FUNCTION public.suspend_expired_trials()
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  trial_ends_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.id, t.name, t.trial_ends_at
    FROM tenants t
    WHERE t.subscription_status = 'trial'
      AND t.trial_ends_at IS NOT NULL
      AND t.trial_ends_at < now()
  LOOP
    UPDATE tenants
    SET subscription_status = 'past_due',
        updated_at = now()
    WHERE id = r.id AND subscription_status = 'trial';

    IF FOUND THEN
      INSERT INTO audit_logs (
        tenant_id, user_id, role, action, entity_type, entity_id,
        description, changes
      ) VALUES (
        r.id, NULL, 'system', 'auto_suspend', 'tenants', r.id,
        'Trial expired — moved to past_due',
        jsonb_build_object(
          'trial_ends_at', r.trial_ends_at,
          'suspended_at', now(),
          'reason', 'trial_expired'
        )
      );

      tenant_id := r.id;
      tenant_name := r.name;
      trial_ends_at := r.trial_ends_at;
      suspended_at := now();
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;
