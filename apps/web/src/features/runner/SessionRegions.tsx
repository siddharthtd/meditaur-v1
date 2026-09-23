"use client";

import { EYEBROW_CLASS } from "@meditaur/ui";
import type { CompiledBlock, CompiledFact, CompiledSymbolGroup } from "@meditaur/domain";
import { useEffect, useRef } from "react";

import { scrollTarget } from "./scroll-rate";

/** A column with no value says so rather than showing a blank. */
const MISSING = "-";

/**
 * One line of the intentions column, with the symbol it belongs to.
 *
 * The column is one continuous list — that is the point of it (§12.20) — but it is
 * drawn as a **table** (the owner's round 16, item 4), so every line carries both
 * the group it came from (`null` for the meditation's own lines, which belong to no
 * symbol) and that group's name, which is what the table's left column prints.
 */
export type RunLine = { text: string; groupIndex: number | null; symbol: string | null };

/**
 * The block's lines in the order the session reads them.
 *
 * A block's `intentions` is already the meditation's own lines followed by each
 * symbol's, so this rebuilds the same order and adds the group each line came from.
 * An **affirmations** stage is the other way round: what it reads out is the
 * meditation's own sentences, so a block with one shows those instead of its lines.
 */
export function blockLines(block: CompiledBlock, stageKind: string | null): RunLine[] {
  if (stageKind === "affirmations") {
    return (block.affirmations ?? []).map((text) => ({
      text,
      groupIndex: null,
      symbol: null,
    }));
  }
  const lines: RunLine[] = [];
  for (const text of block.focusIntentions ?? []) {
    lines.push({ text, groupIndex: null, symbol: null });
  }
  (block.symbolGroups ?? []).forEach((group, index) => {
    for (const text of group.intentions ?? []) {
      lines.push({ text, groupIndex: index, symbol: group.name });
    }
  });
  // A snapshot compiled before symbol grouping carries one flat list and no
  // groups; the lines are still the reader's, so they are still shown.
  if (lines.length === 0) {
    for (const text of block.intentions ?? []) {
      lines.push({ text, groupIndex: null, symbol: null });
    }
  }
  return lines;
}

/** One symbol's lines, as the table draws them: one `<tbody>` per group. */
export type RunGroup = { key: string; symbol: string | null; rows: RunLine[] };

/**
 * The lines, grouped for the table.
 *
 * Grouped by the group they came from rather than by the name they print: two
 * different symbols may share a name, and the lines of the meditation itself are a
 * group of their own with nothing in the table's left column.
 */
export function runGroups(lines: RunLine[]): RunGroup[] {
  const groups: RunGroup[] = [];
  lines.forEach((line, index) => {
    const last = groups.at(-1);
    if (last && last.rows[0]?.groupIndex === line.groupIndex) {
      last.rows.push(line);
      return;
    }
    groups.push({ key: `g${index}`, symbol: line.symbol, rows: [line] });
  });
  return groups;
}

function Facts({ facts }: { facts: CompiledFact[] }): React.ReactNode {
  if (facts.length === 0) return null;
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {facts.map((fact) => (
        <div key={fact.key} className="flex flex-col gap-0.5">
          <dt className={`${EYEBROW_CLASS} text-xs`}>{fact.label}</dt>
          <dd className="text-text">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The facts, with the pinned ones in a band that stays put.
 *
 * The plan's `Display` has a `Pin` switch, and this is what it means on this screen:
 * a pinned fact sits at the top of its panel while the panel's own content scrolls
 * under it (§12.28 — "a pinned column sits with the chakra's or the symbol's name").
 * A panel is only ever scrolled when its facts do not fit, so a plan that pins
 * nothing renders exactly as before.
 */
function FactsWithPins({ facts }: { facts: CompiledFact[] }): React.ReactNode {
  const pinned = facts.filter((fact) => fact.pinned);
  const rest = facts.filter((fact) => !fact.pinned);
  return (
    <>
      {pinned.length > 0 ? (
        <div
          data-pinned-facts
          className="sticky top-0 z-10 -mx-1 mb-1 bg-surface px-1 pb-1"
        >
          <Facts facts={pinned} />
        </div>
      ) : null}
      <Facts facts={rest} />
    </>
  );
}

/**
 * The meditation's own columns, in the screen's top strip.
 *
 * The owner's round 16, items 0 and 9: the box that used to head itself with the
 * meditation and its type is gone — the name is the screen's own title, and a box
 * that repeated it showed nothing — while the meditation's **Display columns** stay,
 * because that is the ask round 15 recorded. They sit in the `top` slot so they cost
 * height rather than the intentions' width, and the region is not drawn at all when
 * none of them has a value.
 *
 * Pinned first: there is nothing here to scroll any more, so a pin means "the one I
 * want to read first" rather than "the one that stays put".
 */
export function MeditationStrip({ facts }: { facts: CompiledFact[] }): React.ReactNode {
  const ordered = [...facts.filter((fact) => fact.pinned), ...facts.filter((f) => !f.pinned)];
  return (
    <section
      aria-label="Meditation"
      data-meditation-facts
      className="flex min-h-0 shrink-0 flex-wrap items-baseline gap-x-6 gap-y-1 overflow-auto rounded-2xl border border-line bg-surface px-4 py-2"
    >
      {ordered.map((fact) => (
        <div key={fact.key} className="flex items-baseline gap-1.5">
          <span className={`${EYEBROW_CLASS} text-xs`}>{fact.label}</span>
          <span className="text-sm text-text">{fact.value.trim() || MISSING}</span>
        </div>
      ))}
    </section>
  );
}

/**
 * The symbol in play, updating **in place** (§6.2).
 *
 * It shows the symbol whose lines the reader is looking at — the one at the top of
 * the visible intentions column — rather than stacking one box per symbol, which is
 * what made the old screen grow with the size of the block. The region is drawn only
 * when the block has symbol groups, which is the owner's round 16 item 8 read
 * generally: a meditation with no symbols gets no box and no gap where one was.
 */
export function SymbolRail({
  group,
  imageUrl,
}: {
  group: CompiledSymbolGroup | null;
  imageUrl: string | null;
}): React.ReactNode {
  if (!group) return null;
  return (
    <section
      aria-label="Symbol"
      className="flex h-full min-h-0 flex-col gap-2 overflow-auto rounded-2xl border border-line bg-surface px-4 py-3"
    >
      <div className="flex items-center gap-2">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${group.name} symbol`}
            className="h-10 w-10 shrink-0 rounded-xl bg-surface-raised/80 object-contain"
          />
        ) : null}
        <h2 className="text-lg leading-tight">{group.name}</h2>
      </div>
      <FactsWithPins facts={[...(group.facts ?? []), ...(group.entryFacts ?? [])]} />
    </section>
  );
}

/**
 * The symbols in play, as a sheet of them.
 *
 * The owner's round 17, item 4: *"The symbol stage doesn't need to show me the
 * intentions, only symbols (I envision having pictures for all symbols, so that those
 * can be displayed here, until then, just the names of symbols will do."* — and, on
 * which of the two: *"Symbols for the meditation all shown as icons (only names if
 * images are not available, images if they are available). They should be shown in the
 * main region only instead of the intentions."*
 *
 * So a `symbols` stage's main region is this rather than the intentions column: the
 * block's symbols, in the order the block walks them, each drawn as its picture when
 * it has one and named always — a picture nobody can name is not a meditation aid.
 *
 * The one **in play** is marked rather than scrolled to: there is nothing to scroll
 * here, so the clock is what says which symbol the reader is with (`stage-progress.ts`)
 * and the details beside this region follow it. That is also item 7's *"it should be
 * updated with time even though the scrolling stops"*, which is what a stage with no
 * scrolling at all is the extreme case of.
 */
export function SymbolGallery({
  groups,
  currentIndex,
  imageUrls,
}: {
  groups: CompiledSymbolGroup[];
  /** Which symbol the stage's clock has reached, as an index into `groups`. */
  currentIndex: number;
  /** Resolved pictures, by media-asset id — the run screen's blob-URL cache. */
  imageUrls: Record<string, string>;
}): React.ReactNode {
  if (groups.length === 0) {
    return (
      <section
        aria-labelledby="run-symbols"
        className="flex h-full min-h-0 flex-col gap-2"
      >
        <h2 id="run-symbols" className={`${EYEBROW_CLASS} shrink-0 text-sm`}>
          Symbols
        </h2>
        <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-muted">
          This meditation has no symbols.
        </p>
      </section>
    );
  }
  return (
    <section
      aria-labelledby="run-symbols"
      className="flex h-full min-h-0 flex-col gap-2"
    >
      <h2 id="run-symbols" className={`${EYEBROW_CLASS} shrink-0 text-sm`}>
        Symbols
      </h2>
      <ul
        data-symbol-gallery
        className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] content-start gap-3 overflow-y-auto rounded-2xl border border-line bg-surface p-3"
      >
        {groups.map((group, index) => (
          <li
            key={`${index}-${group.name}`}
            data-symbol={index}
            data-current={index === currentIndex ? "true" : "false"}
            className={`flex flex-col items-center justify-start gap-1 rounded-xl px-2 py-3 text-center transition-colors ${
              index === currentIndex ? "bg-surface-raised" : ""
            }`}
          >
            {group.imageAssetId && imageUrls[group.imageAssetId] ? (
              <>
                <img
                  src={imageUrls[group.imageAssetId]!}
                  alt={`${group.name} symbol`}
                  className="h-16 w-16 object-contain"
                />
                {/* Named as well as drawn: the picture is the aid and the name is
                    what makes it findable, which is the pair the symbol's own panel
                    heads itself with. */}
                <span className="text-xs text-muted">{group.name}</span>
              </>
            ) : (
              // No picture yet — the owner's *"until then, just the names of symbols
              // will do"* — so the name is the whole of the cell, at the size a name
              // needs to be to read from across a room. Named once, because it is the
              // only thing in the cell.
              <span className="flex h-16 items-center justify-center px-1 text-base leading-tight text-text">
                {group.name}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The intentions table: every line of the block, in order, in one list.
 *
 * The one region that scrolls (§12.20, §6.3). It takes the room the other regions
 * do not, so the intentions get most of the screen; the rate is derived from the
 * clock (see `scroll-rate.ts`) rather than being a fixed speed; and a hand on the
 * list re-syncs rather than being fought. Auto-scroll is on only for an intentions
 * or affirmations stage whose own switch is on, and it stops at the **stage's** end,
 * never the block's.
 *
 * The owner's round 16, item 4: *"intentions should have table-like borders between
 * them so that one can bifurcate between them, otherwise it is like reading an
 * essay."* So it is a table — one `<tbody>` per symbol, its name in a left column
 * that spans its lines, a hairline under every line — rather than a run of
 * paragraphs. A reader pausing mid-scroll can see where one symbol's lines end.
 */
export function IntentionsTable({
  title,
  lines,
  enabled,
  held,
  running,
  remainingMs,
  stageKey,
  onTopGroup,
}: {
  title: string;
  lines: RunLine[];
  enabled: boolean;
  /**
   * The stage's switch **is** on and the reader's own `prefers-reduced-motion` is
   * what is stopping the column — a different sentence from "off", and the one the
   * reader is told by the switch they can press.
   */
  held: boolean;
  running: boolean;
  remainingMs: number;
  /** Changes at every stage boundary, so the loop re-derives from the clock. */
  stageKey: string;
  /**
   * Which symbol's lines are on top, and whether the column has anywhere left to go.
   *
   * `atEnd` is the owner's round 17, item 7: a column that has run out of travel —
   * because its lines fit the card, or because it has reached the bottom — cannot say
   * which symbol is in play any more, so the runner hands that job to the clock
   * (`stage-progress.ts`) instead of freezing on the last one it saw.
   */
  onTopGroup: (groupIndex: number | null, atEnd: boolean) => void;
}): React.ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  /** Read by the frame loop, so it never has to be torn down to see a new value. */
  const live = useRef({ enabled, running, remainingMs });
  live.current = { enabled, running, remainingMs };
  /**
   * Where the column is, kept here rather than read back off the element.
   *
   * A scroll offset is rounded to whole pixels, so a frame's fraction of a pixel —
   * and the rate is one screenful per stage, which is a fraction of a pixel per
   * frame — is thrown away by the browser and the column never moves at all. The
   * position is therefore ours and floats; only what goes on screen is rounded.
   */
  const positionPx = useRef(0);
  /** The whole pixel we last put on screen, so a reader's own scroll is recognisable. */
  const writtenPx = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let last = performance.now();
    positionPx.current = ref.current?.scrollTop ?? 0;
    writtenPx.current = positionPx.current;
    const step = (now: number) => {
      const element = ref.current;
      const elapsedMs = now - last;
      last = now;
      if (element) {
        positionPx.current = scrollTarget({
          scrollTop: positionPx.current,
          contentPx: element.scrollHeight,
          viewportPx: element.clientHeight,
          remainingMs: live.current.remainingMs,
          elapsedMs,
          running: live.current.running,
        });
        const rounded = Math.round(positionPx.current);
        if (rounded !== writtenPx.current) {
          writtenPx.current = rounded;
          element.scrollTop = rounded;
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [enabled, stageKey]);

  /**
   * Which symbol the reader is looking at: the topmost line that is on screen.
   *
   * The panel beside this column is what makes the session readable at a glance
   * (§6.2), and it has to follow the reader — including a reader who scrolled by
   * hand, which is why this listens rather than being told by the frame loop.
   */
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      // A reader's hand re-syncs the column rather than being fought (§6.3): a
      // scroll we did not make becomes the position the clock now runs from. Ours
      // are recognised by being within a pixel of what was last written, so the
      // rounding above cannot be mistaken for a hand.
      const at = element.scrollTop;
      if (Math.abs(at - writtenPx.current) > 1) {
        positionPx.current = at;
        writtenPx.current = at;
      }
      const top = element.getBoundingClientRect().top;
      let found: number | null = lines[0]?.groupIndex ?? null;
      for (const item of element.querySelectorAll<HTMLElement>("[data-line]")) {
        if (item.getBoundingClientRect().top - top > 8) break;
        const index = Number(item.dataset.group);
        found = Number.isNaN(index) ? null : index;
      }
      const max = Math.max(0, element.scrollHeight - element.clientHeight);
      onTopGroup(found, max === 0 || at >= max - 1);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    return () => element.removeEventListener("scroll", update);
  }, [lines, stageKey, onTopGroup]);

  const groups = runGroups(lines);
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-2" aria-labelledby="run-intentions">
      <h2 id="run-intentions" className={`${EYEBROW_CLASS} shrink-0 text-sm`}>
        {title}
      </h2>
      {lines.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-muted">
          Nothing for this stage.
        </p>
      ) : (
        <div
          ref={ref}
          data-intentions-scroll
          // Whether the column is walking itself down: `on`, `off`, or `held` — the
          // last when the stage's switch is on and the reader's preference is what
          // is stopping it. The suite reads this, because a still column has three
          // possible reasons and they look identical from the outside.
          data-auto-scroll={enabled ? "on" : held ? "held" : "off"}
          className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line bg-surface"
        >
          <table className="w-full border-separate border-spacing-0 text-left text-xl leading-relaxed">
            <colgroup>
              <col className="w-32" />
              <col />
            </colgroup>
            {groups.map((group) => (
              <tbody key={group.key}>
                {group.rows.map((line, at) => (
                  <tr
                    key={`${at}-${line.text}`}
                    data-line
                    data-group={line.groupIndex ?? ""}
                    className="align-top"
                  >
                    {/* The symbol's name, once, spanning its own lines: the left
                        column of the table is what makes the column tell a reader
                        which symbol they are in without the panel beside it. */}
                    {at === 0 ? (
                      <th
                        scope="rowgroup"
                        rowSpan={group.rows.length}
                        className="border-b border-r border-line/60 px-3 py-2 text-left align-top text-sm font-medium text-muted"
                      >
                        {group.symbol ?? ""}
                      </th>
                    ) : null}
                    <td className="border-b border-line/60 px-4 py-2">{line.text}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
