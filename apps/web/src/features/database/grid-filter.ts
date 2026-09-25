/**
 * What one column's filter means — the owner's round 22.
 *
 * The owner: *"Clicking on any column header should convert that into a filter bar. It
 * should display all the rows that contain the particular text for that column. This should
 * be for all columns. Including having multiple filterable columns, if multiple columns'
 * filters are activated, it should be an 'AND' action. Each search table should be able to
 * do an | for OR, regular expression search should also be supported."*
 *
 * So one filter is a **list of alternatives** and a row matches when any of them does —
 * case-insensitive, each one a regular expression, and `|` is the separator. Two things
 * that read as footnotes are deliberate:
 *
 * - an alternative that will not compile is read as plain text rather than as an error. A
 *   trailing `\` or an unclosed group is a typo, and answering a typo by hiding every row is
 *   the one outcome a filter must never produce;
 * - an empty alternative is ignored, so `love |` is `love` — and a filter of nothing but
 *   separators is no filter at all.
 *
 * Nothing here knows about tables or columns: it is text in, yes or no out, which is what
 * makes it testable without a screen (`tests/unit/web/grid-filter.test.ts`).
 */

/** One column's filter text against one cell's text. */
export function matchFilter(text: string, filter: string): boolean {
  const alternatives = filterAlternatives(filter);
  if (alternatives.length === 0) return true;
  const haystack = text.toLowerCase();
  return alternatives.some((alternative) => {
    const pattern = asRegExp(alternative);
    return pattern ? pattern.test(text) : haystack.includes(alternative.toLowerCase());
  });
}

/**
 * A filter's alternatives: the text split on `|` **at the top level**.
 *
 * `|` is the OR the owner asked for, but it is also a regular expression's own alternation —
 * so splitting on every one of them broke `heal(s|ing)$` into two invalid halves, which is
 * the shape a reader writing a regex will reach for first. Only a `|` outside any group and
 * outside a character class separates alternatives; one inside stays part of the pattern, and
 * `\|` is a literal bar either way.
 */
function filterAlternatives(filter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let escaped = false;
  let inClass = false;
  for (const char of filter) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "(" && !inClass) depth += 1;
    else if (char === ")" && !inClass) depth = Math.max(0, depth - 1);
    else if (char === "|" && !inClass && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((row) => row.trim()).filter((row) => row !== "");
}

/**
 * A row against **every** filter the reader has set.
 *
 * `columnTexts` is keyed by the same `columnKey` the filter is (`builtin:name`,
 * `column:<id>`), so a column the table has stopped drawing simply finds no text and its
 * filter stops narrowing anything rather than matching everything by accident. One column's
 * failure is the row's — that is the AND the owner asked for.
 */
export function rowMatches(
  columnTexts: Record<string, string>,
  filters: Record<string, string>,
): boolean {
  for (const [key, filter] of Object.entries(filters)) {
    if (!matchFilter(columnTexts[key] ?? "", filter)) return false;
  }
  return true;
}

/** The filters that are actually doing something, for a sentence and a count. */
export function activeFilters(filters: Record<string, string>): [string, string][] {
  return Object.entries(filters).filter(([, filter]) => filter.trim() !== "");
}

function asRegExp(source: string): RegExp | null {
  try {
    // No `g` flag: a global pattern carries `lastIndex` between calls, so the same filter
    // would match every other row.
    return new RegExp(source, "i");
  } catch {
    return null;
  }
}
