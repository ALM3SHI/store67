import { editDistance, expandToken, normalizeText, tokenize } from "./normalize";

export type Searchable = {
  id: string;
  /** Weighted fields: name matches count most */
  name: string[];
  keywords: string[];
  body: string[];
};

type Indexed = { id: string; fields: { tokens: string[]; weight: number; joined: string }[] };

export function buildIndex(items: Searchable[]): Indexed[] {
  return items.map((it) => ({
    id: it.id,
    fields: [
      { list: it.name, weight: 10 },
      { list: it.keywords, weight: 6 },
      { list: it.body, weight: 2 },
    ].map((f) => {
      const text = f.list.join(" ");
      return { tokens: tokenize(text), weight: f.weight, joined: normalizeText(text) };
    }),
  }));
}

/**
 * Scores items for a query. Each query token must match something (exact,
 * prefix, synonym, or within a small edit distance) for an item to qualify.
 */
export function search(index: Indexed[], query: string): { id: string; score: number }[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const qJoined = normalizeText(query);
  const results: { id: string; score: number }[] = [];

  for (const item of index) {
    let total = 0;
    let allMatched = true;
    for (const qt of qTokens) {
      const variants = expandToken(qt);
      let best = 0;
      for (const f of item.fields) {
        for (const tok of f.tokens) {
          for (const v of variants) {
            let s = 0;
            if (tok === v) s = 1;
            else if (v.length >= 2 && tok.startsWith(v)) s = 0.8;
            else if (v.length >= 4 && tok.includes(v)) s = 0.5;
            else if (v.length >= 4) {
              const maxEd = v.length >= 7 ? 2 : 1;
              if (editDistance(v, tok, maxEd) <= maxEd) s = 0.45;
            }
            if (v !== qt) s *= 0.85; // synonym match slightly lower
            best = Math.max(best, s * f.weight);
          }
        }
      }
      if (best === 0) {
        allMatched = false;
        break;
      }
      total += best;
    }
    if (!allMatched) continue;
    // Phrase bonus
    if (qJoined.length > 2 && item.fields[0]!.joined.includes(qJoined)) total += 5;
    results.push({ id: item.id, score: total });
  }
  return results.sort((a, b) => b.score - a.score);
}
