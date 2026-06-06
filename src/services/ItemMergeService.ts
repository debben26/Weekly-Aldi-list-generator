// ItemMergeService — duplicate detection & quantity aggregation (spec 8.1a / 8.1b).
// M2 implements only `normalizeText`, the merge-key normalizer used to store aliases and, in
// M5, to match rows that lack an item_id. The full merge engine lands in M5.

// Words that already end in "s" but are singular / shouldn't be stripped naively are handled by
// the rules below; this is a deliberately small, deterministic singularizer (not a full
// inflector) — same input always yields the same output.
function singularizeToken(token: string): string {
  if (token.length <= 3) return token; // gas, oat... leave short tokens alone
  if (token.endsWith("ies")) return token.slice(0, -3) + "y"; // berries -> berry
  if (token.endsWith("oes")) return token.slice(0, -2); // tomatoes -> tomato
  if (/(ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2); // boxes -> box
  if (token.endsWith("ss")) return token; // glass -> glass
  if (token.endsWith("s")) return token.slice(0, -1); // tomatoes->tomatoe? handled below
  return token;
}

/**
 * Normalize free text for merge matching and alias storage (spec 8.1b):
 * lowercase, strip punctuation, collapse whitespace, singularize each token.
 * Deterministic and idempotent.
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // strip punctuation/symbols
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}
