// Shared FormData field parsing for server actions.

// Parse a numeric form field: blank -> null, junk -> null, otherwise the number.
export function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
