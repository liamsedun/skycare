-- 0016_staff_hard_delete.sql
-- Allow permanent deletion of staff/Admin/Doctor/Nurse/etc accounts by the
-- Super Admin. Every FK that references users(id) with NO ACTION would block
-- deleting the users row (service-role DELETE) and leave orphaned references,
-- so convert them to ON DELETE SET NULL (the audit columns are all nullable).
-- FKs that are already ON DELETE CASCADE (staff, rosters, leave, notifications,
-- internal mail, chats) or ON DELETE SET NULL are left untouched.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
      AND rc.delete_rule = 'NO ACTION'
    ORDER BY tc.table_name, kcu.column_name
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(id) ON DELETE SET NULL',
      r.table_name, r.constraint_name, r.column_name
    );
    RAISE NOTICE 'users(id) FK on %.% -> ON DELETE SET NULL', r.table_name, r.column_name;
  END LOOP;
END $$;
