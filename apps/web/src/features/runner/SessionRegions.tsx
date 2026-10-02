"use client";

import { EYEBROW_CLASS } from "@meditaur/ui";
import type { CompiledBlock, CompiledFact, CompiledSymbolGroup } from "@meditaur/domain";
import { useEffect, useRef } from "react";

import { SymbolGlyph } from "./focus-glyphs";
import { scrollTarget } from "./scroll-rate";
import type { RailSubject } from "./session-regions";
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
export type RunLine = { text: string; groupIndex: number | null; label: string | null };

/**
 * The block's lines in the order the session reads them.
 *
 * A block's `intentions` is already the meditation's own lines followed by each
 * symbol's, so this rebuilds the same order and adds the group each line came from.
 *
 * An **affirmations** stage is the other way round: what it reads out is a list of sentences
 * rather than the block's lines, and there are two of those lists since round 26 — the
 * meditation's own (`affirmations`) and the workspace's shared **declaration** pool with this
 * block's meditations substituted in (`declarations`). The stage's `pool` is what chooses
 * between them, which is why this takes the stage rather than only its kind.
 */
export function blockLines(
  block: CompiledBlock,
  stage: { kind: string; pool?: string } | null,
): RunLine[] {
  if (stage?.kind === "affirmations") {
    const sentences =
      stage.pool === "declaration" ? (block.declarations ?? []) : (block.affirmations ?? []);
    return sentences.map((text) => ({
      text,
      groupIndex: null,
      label: null,
    }));
  }
  // A block of several points reads **by point** (the owner's round 26): the same lines, grouped
  // the other way, so the table's left column names the point a line was written for instead of
  // the symbol it hangs off. A block that draws a subset keeps its symbol groups, which is
  // `CompiledBlock.pointLines`' own note.
  if ((block.pointLines ?? []).length > 0) {
    const byPoint: RunLine[] = [];
    for (const [index, group] of block.pointLines!.entries()) {
      for (const text of group.lines) {
        byPoint.push({ text, groupIndex: index, label: group.name });
      }
    }
    return byPoint;
  }
  const lines: RunLine[] = [];
  for (const text of block.focusIntentions ?? []) {
    lines.push({ text, groupIndex: null, label: null });
  }
  (block.symbolGroups ?? []).forEach((group, index) => {
    for (const text of group.intentions ?? []) {
      lines.push({ text, groupIndex: index, label: group.name });
    }
  });
  // A snapshot compiled before symbol grouping carries one flat list and no
  // groups; the lines are still the reader's, so they are still shown.
  if (lines.length === 0) {
    for (const text of block.intentions ?? []) {
      lines.push({ text, groupIndex: null, label: null });
    }
  }
  return lines;
}

/** One symbol's lines — or one **point**'s — as the table draws them: one `<tbody>` per group. */
export type RunGroup = { key: string; label: string | null; rows: RunLine[] };

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
    groups.push({ key: `g${index}`, label: line.label, rows: [line] });
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
 * What the block is about, beside its lines, updating **in place** (§6.2).
 *
 * It shows the subject the reader is looking at — the symbol in play (the one whose lines are at
 * the top of the visible column) or, where the lines are the meditation's own, the meditation
 * itself — rather than stacking one box per symbol, which is what made the old screen grow with
 * the size of the block. The owner's round 26, item 11 is the meditation half: *"if it is a
 * chakra-only intention, the side-panel should display the details of the chakra."*
 *
 * A meditation gets its picture and its columns and **no heading**, because its name is already
 * the screen's title: that is the round-16 reason the panel which repeated it was deleted, and
 * repeating it here would put two headings with one name on the screen. A symbol keeps its name,
 * since the symbol is not the title.
 */
export function SessionRail({
  subject,
  imageUrl,
}: {
  subject: RailSubject | null;
  imageUrl: string | null;
}): React.ReactNode {
  if (!subject) return null;
  const isSymbol = subject.kind === "symbol";
  return (
    <section
      aria-label={isSymbol ? "Symbol" : "Meditation"}
      data-rail={subject.kind}
      className="flex h-full min-h-0 flex-col gap-2 overflow-auto rounded-2xl border border-line bg-surface px-4 py-3"
    >
      {imageUrl || isSymbol ? (
        <div className="flex items-center gap-2">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={isSymbol ? `${subject.name} symbol` : `${subject.name || "The meditation"}'s picture`}
              className="h-10 w-10 shrink-0 rounded-xl bg-surface-raised/80 object-contain"
            />
          ) : null}
          {isSymbol ? <h2 className="text-lg leading-tight">{subject.name}</h2> : null}
        </div>
      ) : null}
      <FactsWithPins facts={subject.facts} />
    </section>
  );
}

/**
 * The symbols stage: the symbol in play, large, over the block's own line of them.
 *
 * The owner's round 26, verbatim: *"The Symbol stage needs to change - The current boxes of
 * symbols is absolutely hideous, it is a sore in my sight. … The boxes and their names aligned to
 * one side of the screen have to go. Instead, I want the view you currently have for the focus
 * stage. One big symbol at the top which breathes and updates as the time passes. Rest of the
 * symbols at the bottom in a single line also breathing."*
 *
 * So round 22's honeycomb of framed boxes is gone, and with it every name drawn beside a picture:
 * what this stage draws is the **picture**, and the rail beside it is what names the one the clock
 * has reached. The line underneath keeps the block's own order — all of the symbols, not only the
 * ones still to come — so the stage reads as a family with one member in play rather than a row
 * that reshuffles every time the clock moves on.
 */
export function SymbolStage({
  groups,
  currentIndex,
  imageUrls,
  reduceMotion,
}: {
  groups: CompiledSymbolGroup[];
  /** Which symbol the stage's clock has reached, as an index into `groups`. */
  currentIndex: number;
  /** Resolved pictures, by media-asset id — the run screen's blob-URL cache. */
  imageUrls: Record<string, string>;
  /** A reader who asked their machine for less motion gets the pictures still. */
  reduceMotion: boolean;
}): React.ReactNode {
  const breathe = reduceMotion ? "" : "animate-breathe";
  if (groups.length === 0) {
    return (
      <section data-symbol-stage className="flex h-full min-h-0 flex-col gap-2">
        <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-muted">
          This meditation has no symbols.
        </p>
      </section>
    );
  }
  const at = Math.min(Math.max(0, currentIndex), groups.length - 1);
  const current = groups[at]!;
  return (
    <section
      data-symbol-stage
      className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-6"
    >
      {/* The one in play, big and breathing. Named for a screen reader on the region rather than
          as a caption a reader has to look past: the rail names it beside the stage, and a points
          block has no rail at all. */}
      <div
        data-symbol-main
        role="img"
        aria-label={`${current.name} symbol`}
        className={`flex min-h-0 flex-1 items-center justify-center ${breathe}`}
      >
        <SymbolFigure
          group={current}
          imageUrl={current.imageAssetId ? imageUrls[current.imageAssetId] : undefined}
          className="h-48 w-48 sm:h-64 sm:w-64"
        />
      </div>
      <ul
        data-symbol-line
        className="flex shrink-0 flex-wrap items-center justify-center gap-6 pb-1"
      >
        {groups.map((group, index) => (
          <li
            key={`${index}-${group.name}`}
            data-symbol={index}
            data-current={index === at ? "true" : "false"}
            // Staggered so the line breathes in a round rather than in one breath, which is the
            // composition the owner asked for; the one in play is at full strength and the rest
            // are held back, which is the only thing that marks it — the sizes are equal.
            style={{ animationDelay: `${index * 0.7}s` }}
            className={`flex items-center justify-center ${breathe} ${
              index === at ? "opacity-100" : "opacity-60"
            }`}
          >
            <SymbolFigure
              group={group}
              imageUrl={group.imageAssetId ? imageUrls[group.imageAssetId] : undefined}
              className="h-16 w-16 sm:h-20 sm:w-20"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One symbol, as the run screen draws it.
 *
 * The reader's own picture when there is one, and otherwise the glyph this app draws for the
 * symbol (`focus-glyphs.tsx`) — which is the same pair every other surface uses, so a symbol looks
 * like itself wherever it appears. `alt` is empty and the region is labelled instead: a picture
 * repeated in a line of four announcements is worse than one name for the group.
 */
function SymbolFigure({
  group,
  imageUrl,
  className,
}: {
  group: CompiledSymbolGroup;
  imageUrl: string | undefined;
  className: string;
}): React.ReactNode {
  if (imageUrl) {
    return <img src={imageUrl} alt="" aria-hidden="true" className={`${className} object-contain`} />;
  }
  return <SymbolGlyph name={group.name} className={className} />;
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
    <section className="flex h-full min-h-0 flex-1 flex-col" aria-labelledby="run-intentions">
      {/*
       * The heading is **inside** the panel, which is the owner's round 26: *"The
       * 'Intentions' heading is out of the panel with intentions - Make it so that the
       * Intentions Heading is inside the panel, so that the panel properly aligns with the
       * vertical Symbol panel on the left."* The two boxes therefore start on the same line,
       * and the heading **sticks** to the top of the scroller so it keeps naming the column
       * while the lines walk under it — the way a pinned fact does in the panel beside it.
       */}
      <div
        ref={ref}
        data-intentions-scroll
        // Whether the column is walking itself down: `on`, `off`, or `held` — the
        // last when the stage's switch is on and the reader's preference is what
        // is stopping it. The suite reads this, because a still column has three
        // possible reasons and they look identical from the outside.
        data-auto-scroll={enabled ? "on" : held ? "held" : "off"}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-2xl border border-line bg-surface"
      >
        <h2
          id="run-intentions"
          className={`${EYEBROW_CLASS} sticky top-0 z-10 shrink-0 border-b border-line/60 bg-surface px-4 py-3 text-sm`}
        >
          {title}
        </h2>
        {lines.length === 0 ? (
          <p className="px-4 py-3 text-muted">Nothing for this stage.</p>
        ) : (
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
                        {group.label ?? ""}
                      </th>
                    ) : null}
                    <td className="border-b border-line/60 px-4 py-2">{line.text}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
      </div>
    </section>
  );
}
