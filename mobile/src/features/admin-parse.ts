/** Parses the points field: a whole number, optionally signed; null when it is not one or is 0. */
export function parsePoints(text: string): number | null {
  const t = text.trim();
  if (!/^[+-]?\d{1,6}$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return n === 0 ? null : n;
}
