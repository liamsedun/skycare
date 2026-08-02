-- ============================================================================
-- SKYCARE — MIGRATION 0003: ANALYTICS ENGINE
-- Denormalized daily metrics tables + triggers + reporting views.
-- Analytics rows are written by DB triggers (service-role side) so they are
-- append/upsert-safe and never hit RLS-write filters on staff queries.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- DAILY METRICS (one row per tenant+branch+date)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_daily (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       uuid REFERENCES branches(id) ON DELETE SET NULL,
  "date"          date NOT NULL,
  total_patients          integer NOT NULL DEFAULT 0,   -- registered that day
  new_patients            integer NOT NULL DEFAULT 0,
  total_appointments      integer NOT NULL DEFAULT 0,
  completed_appointments  integer NOT NULL DEFAULT 0,
  no_show_appointments    integer NOT NULL DEFAULT 0,
  outpatient_visits       integer NOT NULL DEFAULT 0,
  inpatient_visits        integer NOT NULL DEFAULT 0,
  lab_orders              integer NOT NULL DEFAULT 0,
  prescriptions           integer NOT NULL DEFAULT 0,
  tests_ordered           integer NOT NULL DEFAULT 0,
  abnormal_results        integer NOT NULL DEFAULT 0,
  beds_occupied           integer NOT NULL DEFAULT 0,
  total_revenue           numeric(14,2) NOT NULL DEFAULT 0,
  total_expenses          numeric(14,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_daily ON analytics_daily (tenant_id, branch_id, "date");

-- ---------------------------------------------------------------------------
-- UPSERT HELPER
-- Column name is interpolated with %I (safe quoting); delta passed as param.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_bump_daily(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_date date,
  p_field text,
  p_delta numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO analytics_daily (tenant_id, branch_id, "date", %I)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, branch_id, "date")
     DO UPDATE SET %I = analytics_daily.%I + EXCLUDED.%I, updated_at = now()',
    p_field, p_field, p_field, p_field
  ) USING p_tenant_id, p_branch_id, p_date, p_delta;
END $$;

-- ---------------------------------------------------------------------------
-- TRIGGER FUNCTIONS
-- ---------------------------------------------------------------------------
-- Revenue: count a payment once, on completion.
CREATE OR REPLACE FUNCTION trg_daily_revenue() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    PERFORM analytics_bump_daily(NEW.tenant_id, NULL, CURRENT_DATE, 'total_revenue', NEW.amount);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    PERFORM analytics_bump_daily(NEW.tenant_id, NULL, CURRENT_DATE, 'total_revenue', NEW.amount);
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> 'completed' AND OLD.status = 'completed' THEN
    PERFORM analytics_bump_daily(NEW.tenant_id, NULL, CURRENT_DATE, 'total_revenue', -OLD.amount);
  END IF;
  RETURN NEW;
END $$;

-- Appointments: count creation once; status changes adjust completed/no_show.
CREATE OR REPLACE FUNCTION trg_daily_appointments() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM analytics_bump_daily(NEW.tenant_id, NEW.branch_id, NEW.scheduled_date, 'total_appointments', 1);
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    PERFORM analytics_bump_daily(NEW.tenant_id, NEW.branch_id, NEW.scheduled_date, 'completed_appointments', 1);
  ELSIF TG_OP = 'INSERT' AND NEW.status = 'no_show' THEN
    PERFORM analytics_bump_daily(NEW.tenant_id, NEW.branch_id, NEW.scheduled_date, 'no_show_appointments', 1);
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF OLD.status = 'completed' THEN
      PERFORM analytics_bump_daily(NEW.tenant_id, NEW.branch_id, NEW.scheduled_date, 'completed_appointments', -1);
    ELSIF OLD.status = 'no_show' THEN
      PERFORM analytics_bump_daily(NEW.tenant_id, NEW.branch_id, NEW.scheduled_date, 'no_show_appointments', -1);
    END IF;
    IF NEW.status = 'completed' THEN
      PERFORM analytics_bump_daily(NEW.tenant_id, NEW.branch_id, NEW.scheduled_date, 'completed_appointments', 1);
    ELSIF NEW.status = 'no_show' THEN
      PERFORM analytics_bump_daily(NEW.tenant_id, NEW.branch_id, NEW.scheduled_date, 'no_show_appointments', 1);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Patients: count new registrations.
CREATE OR REPLACE FUNCTION trg_daily_patients() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM analytics_bump_daily(NEW.tenant_id, NEW.branch_id, CURRENT_DATE, 'new_patients', 1);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointments_daily ON appointments;
DROP TRIGGER IF EXISTS trg_payments_daily ON payments;
DROP TRIGGER IF EXISTS trg_patients_daily ON patients;

CREATE TRIGGER trg_appointments_daily AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION trg_daily_appointments();
CREATE TRIGGER trg_payments_daily AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_daily_revenue();
CREATE TRIGGER trg_patients_daily AFTER INSERT ON patients
  FOR EACH ROW EXECUTE FUNCTION trg_daily_patients();

-- ---------------------------------------------------------------------------
-- REPORTING VIEWS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_revenue_monthly AS
SELECT tenant_id, branch_id, date_trunc('month', "date")::date AS month,
       SUM(total_revenue) AS revenue
FROM analytics_daily
GROUP BY tenant_id, branch_id, date_trunc('month', "date");

CREATE OR REPLACE VIEW v_appointment_insights AS
SELECT tenant_id, branch_id, "date",
       total_appointments, completed_appointments, no_show_appointments,
       CASE WHEN total_appointments > 0
            THEN ROUND(100.0 * completed_appointments / total_appointments, 2)
            ELSE 0 END AS completion_rate
FROM analytics_daily;