-- 0084: internal_messages.broadcast_scope CHECK extended with 'patients' (staff -> patients &
-- dependants-with-portal broadcast; 'all' = staff + patients).
ALTER TABLE public.internal_messages DROP CONSTRAINT IF EXISTS internal_messages_broadcast_scope_check;
ALTER TABLE public.internal_messages ADD CONSTRAINT internal_messages_broadcast_scope_check
  CHECK (broadcast_scope IN ('staff', 'patients', 'all'));