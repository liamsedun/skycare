-- ============================================================================
-- SKYCARE — MIGRATION 0005: PATIENT PORTAL (PWA) IDENTITY
-- Links a patient record to an optional auth user (patient_api role) so the
-- patient PWA can read own records only. Run after 0002.
-- ============================================================================

ALTER TABLE patients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patients_user ON patients (user_id);

-- ---------------------------------------------------------------------------
-- PATIENT SELF-SERVICE POLICIES
-- patient_api role: can read/write ONLY rows where user_id = auth.uid().
-- (is_patient() is defined in migration 0002.)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS patients_self ON patients;
CREATE POLICY patients_self ON patients
  USING (tenant_id = get_tenant_id() AND is_patient() AND user_id = auth.uid())
  WITH CHECK (tenant_id = get_tenant_id() AND is_patient() AND user_id = auth.uid());

-- Patient sees own appointments / visits / lab results / invoices.
DROP POLICY IF EXISTS appointments_self ON appointments;
CREATE POLICY appointments_self ON appointments FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient() AND patient_id IN
         (SELECT id FROM patients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS visits_self ON visits;
CREATE POLICY visits_self ON visits FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient() AND patient_id IN
         (SELECT id FROM patients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS invoices_self ON invoices;
CREATE POLICY invoices_self ON invoices FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient() AND patient_id IN
         (SELECT id FROM patients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS medical_records_self ON medical_records;
CREATE POLICY medical_records_self ON medical_records FOR SELECT
  USING (tenant_id = get_tenant_id() AND is_patient() AND NOT is_confidential
         AND patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- PUBLIC BOOKING (hospital website)
-- Anonymous visitors book via the edge function `booking-public` (service role),
-- which validates the tenant slug, creates/finds the patient, and inserts the
-- appointment. No direct anon INSERT policy here — that path stays closed.
-- ---------------------------------------------------------------------------