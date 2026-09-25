import { describe, expect, it } from "vitest";
import { matchFilter, rowMatches } from "../../../apps/web/src/features/database/grid-filter.ts";

describe("a column's filter", () => {
  it("matches a plain substring, whatever the case", () => {
    expect(matchFilter("Heart Chakra", "heart")).toBe(true);
    expect(matchFilter("Heart Chakra", "CHAKRA")).toBe(true);
    expect(matchFilter("Heart Chakra", "throat")).toBe(false);
    // An empty filter narrows nothing, which is what an untouched column is.
    expect(matchFilter("Heart Chakra", "")).toBe(true);
    expect(matchFilter("", "")).toBe(true);
  });

  it("reads a regular expression when it is one", () => {
    expect(matchFilter("I am healed whole and complete", "^I am")).toBe(true);
    expect(matchFilter("All has been healed", "^I am")).toBe(false);
    expect(matchFilter("healing", "heal(s|ing)$")).toBe(true);
    expect(matchFilter("I heal", "heal(s|ing)$")).toBe(false);
  });

  it("leaves a | inside a group or a class to the regular expression", () => {
    // `|` is the OR **at the top level**; inside a group it is the pattern's own
    // alternation, and splitting on it would break the first regex a reader reaches for.
    expect(matchFilter("healing", "heal(s|ing)$")).toBe(true);
    // A bar inside a character class is one of the characters the class matches — and if
    // the splitter had cut the class in two, neither half would be a pattern at all.
    expect(matchFilter("b", "[a|b]")).toBe(true);
    expect(matchFilter("|", "[a|b]")).toBe(true);
    expect(matchFilter("b", "^(a|b)$")).toBe(true);
    // …and the top level still splits, including beside a group.
    expect(matchFilter("fear", "love|(fear|anger)")).toBe(true);
    expect(matchFilter("anger", "love|(fear|anger)")).toBe(true);
    expect(matchFilter("joy", "love|(fear|anger)")).toBe(false);
    // An escaped bar is a literal one.
    expect(matchFilter("a|b", "a\\|b")).toBe(true);
  });

  it("splits on | and matches any alternative — the OR the owner asked for", () => {
    expect(matchFilter("Love flows", "love|compassion")).toBe(true);
    expect(matchFilter("Compassion flows", "love|compassion")).toBe(true);
    expect(matchFilter("Fear flows", "love|compassion")).toBe(false);
    // A separator with nothing after it is not an alternative, and a filter of nothing but
    // separators is not a filter.
    expect(matchFilter("Love flows", "love|")).toBe(true);
    expect(matchFilter("Anything", "|")).toBe(true);
    expect(matchFilter("Anything", " | ")).toBe(true);
  });

  it("reads an alternative that will not compile as plain text", () => {
    // A trailing backslash or an unclosed group is a typo. Answering it by hiding every row
    // is the one outcome a filter must never produce.
    expect(matchFilter("a (b", "a (b")).toBe(true);
    expect(matchFilter("100% sure", "100%")).toBe(true);
    expect(matchFilter("no match here", "(")).toBe(false);
  });
});

describe("a row against every filter", () => {
  const texts = { "builtin:name": "Heart Chakra", "builtin:location": "Center of the chest" };

  it("is the AND of the columns the reader narrowed", () => {
    expect(rowMatches(texts, {})).toBe(true);
    expect(rowMatches(texts, { "builtin:name": "heart" })).toBe(true);
    expect(rowMatches(texts, { "builtin:name": "throat" })).toBe(false);
    expect(
      rowMatches(texts, { "builtin:name": "heart", "builtin:location": "chest" }),
    ).toBe(true);
    // One column failing the row is the row failing: the AND, not the OR.
    expect(
      rowMatches(texts, { "builtin:name": "heart", "builtin:location": "throat" }),
    ).toBe(false);
  });

  it("treats a filter on a column with no text as matching nothing", () => {
    // A column the table has stopped drawing, or a picture cell: a filter that cannot see
    // its cell narrows the row away rather than quietly passing everything.
    expect(rowMatches(texts, { "builtin:picture": "anything" })).toBe(false);
  });
});
