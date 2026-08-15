/**
 * True when `value` (an ISO date or timestamp) falls inside the inclusive
 * [from, to] window (YYYY-MM-DD). An empty `from`/`to` means unbounded on
 * that side; if both are empty every row passes. Lexicographic comparison is
 * safe for ISO 8601 day strings.
 */
export function inDateRange(
  value: string | null | undefined,
  from: string,
  to: string
): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const day = value.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}