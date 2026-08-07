-- ============================================================================
-- SKYCARE — MIGRATION 0029: PRESCRIPTION PDF + VERIFY SNAPSHOT
--
-- 1. Storage bucket for server-rendered prescription PDFs (public bucket —
--    public storage URLs serve the PDF to nurses/patients/verifiers; the PDF
--    contains only what the prescription already shows).
-- 2. prescriptions.pdf_url — attached to internal messages + notifications.
-- 3. prescription_verify_snapshot() — sealed read-only view for the public
--    /verify/prescription/[id] page (status, drugs, doctor, timestamps).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. STORAGE BUCKET (public; served under /object/public/prescription-pdfs/)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prescription-pdfs',
  'prescription-pdfs',
  true,
  5242880,                       -- 5 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. prescriptions.pdf_url
-- ---------------------------------------------------------------------------
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS pdf_url text;

-- ---------------------------------------------------------------------------
-- 3. VERIFY SNAPSHOT — sealed read-only projection for the verification URL:
--    status, pharmacy routing, patient name, doctor, timestamps, drug list
--    (name/dosage/frequency/duration). No financial or PHI beyond the print.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prescription_verify_snapshot(p_prescription_id uuid)
RETURNS TABLE (
  prescription_id uuid,
  status text,
  pharmacy_type text,
  patient_name text,
  doctor_name text,
  issued_at date,
  dispensed_at timestamptz,
  drugs jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id::uuid,
    p.status::text,
    p.pharmacy_type::text,
    CONCAT_WS(' ', pat.first_name, pat.last_name)::text,
    u.full_name::text,
    p.issued_date,
    p.dispensed_at,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'name',      COALESCE(pi.medication_name, d.name),
        'dosage',    pi.dosage,
        'frequency', pi.frequency,
        'route',     pi.route,
        'duration',  pi.duration
      )
      ORDER BY pi.created_at
    ) FILTER (WHERE pi.id IS NOT NULL), '[]'::jsonb)::jsonb
  FROM prescriptions p
  JOIN patients pat ON pat.id = p.patient_id
  LEFT JOIN users u ON u.id = p.doctor_id
  LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
  LEFT JOIN drugs d ON d.id = pi.drug_id
  WHERE p.id = p_prescription_id
  GROUP BY p.id, pat.first_name, pat.last_name, u.full_name;
$$;
REVOKE ALL ON FUNCTION public.prescription_verify_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prescription_verify_snapshot(uuid) TO anon;