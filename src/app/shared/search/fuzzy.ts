/**
 * Tiny dependency-free fuzzy matcher for the command palette.
 *
 * {@link fuzzyScore} returns a positive relevance score when every character of `query`
 * appears in `text` in order (a subsequence match), or 0 when it does not. Higher is better.
 * Bonuses reward matches that feel "right" to a human: consecutive runs, matches at the start
 * of a word (after a space/`-`/`_`/`/`), and a match at the very start of the string. A plain
 * substring therefore always outscores a scattered subsequence, giving substring behaviour a
 * natural floor while still surfacing looser matches below it.
 */

const SCORE_START = 12; // match begins at index 0
const SCORE_WORD_BOUNDARY = 8; // match right after a separator
const SCORE_CONSECUTIVE = 6; // adjacent to the previous match
const SCORE_MATCH = 1; // base per matched character
const PENALTY_GAP = 1; // per skipped character between matches

const SEPARATORS = new Set([' ', '-', '_', '/', '.', ':']);

/** Case-insensitive fuzzy subsequence score; 0 means no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (q.length > t.length) return 0;

  let score = 0;
  let qi = 0;
  let prevMatch = -2; // index of the previous matched char in `t`

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;

    let charScore = SCORE_MATCH;
    if (ti === 0) {
      charScore += SCORE_START;
    } else if (SEPARATORS.has(t[ti - 1])) {
      charScore += SCORE_WORD_BOUNDARY;
    }
    if (ti === prevMatch + 1) {
      charScore += SCORE_CONSECUTIVE;
    } else if (prevMatch >= 0) {
      charScore -= (ti - prevMatch - 1) * PENALTY_GAP;
    }

    score += charScore;
    prevMatch = ti;
    qi++;
  }

  // Only a match if the whole query was consumed.
  return qi === q.length ? Math.max(1, score) : 0;
}
