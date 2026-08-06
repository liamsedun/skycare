-- 0013: Allow custom "add others" values for gender and blood group.
-- The Patients screen now offers dropdowns whose values can be extended by the
-- user (pick a standard option OR type your own). The old CHECK constraints
-- only permitted the canonical lists, which would reject custom entries.
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_gender_check;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_blood_group_check;