-- ============================================================================
-- SKYCARE — MIGRATION 0038: DROP LEGACY PHARMACY OPERATION OVERLOADS
--
-- 0037 recreated the operations with text branch params but the previous
-- uuid-param signatures remained, making function resolution ambiguous.
-- Remove the no-longer-used uuid variants.
-- ============================================================================

DROP FUNCTION IF EXISTS pharmacy_restock(uuid, uuid, uuid, text, date, integer, numeric, uuid, text, uuid, text);
DROP FUNCTION IF EXISTS pharmacy_dispense(uuid, uuid, uuid, integer, text, uuid, text);
DROP FUNCTION IF EXISTS pharmacy_transfer(uuid, uuid, uuid, uuid, integer, uuid, text);