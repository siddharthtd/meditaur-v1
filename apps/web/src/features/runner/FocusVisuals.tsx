import { accentForMeditation } from "@meditaur/ui";
import type { CompiledSymbolGroup } from "@meditaur/domain";
import { ChakraGlyph, SymbolGlyph } from "./focus-glyphs";

/**
 * What a Focus stage draws (the owner's round 20, item 5).
 *
 * Verbatim: *"During focus, we would want to show beautiful visuals of the chakra's picture in
 * its colour, as well as all the symbols in the same colour breathing etc. occupying the
 * entire space that was earlier occupied by the intentions table."*
 *
 * So: the meditation's own picture — uploaded by the reader, or the glyph that stands for it —
 * and the block's symbols beneath it, all in one colour, breathing. The colour is the
 * meditation's accent (`accentForMeditation`): a chakra's own hue, the reader's override, or
 * the neutral cream for a point.
 *
 * Three deliberate choices, all of them the sort of thing that gets argued about later:
 *
 * - **The picture is drawn as ink, not as a wash.** The accent is `currentColor` on every
 *   stroke, so the region reads as a drawing on the screen's own surface. The design rules
 *   forbid a large background wash, and this is the largest surface the app has.
 * - **The breathing is honest about `prefers-reduced-motion`.** A reader who asked their
 *   machine for less motion gets the same picture, still — the same rule the intentions
 *   column follows — which is why the state is on the DOM as `data-breathe` rather than only
 *   in a class name.
 * - **The symbol the stage has reached is the one drawn larger.** The rail beside the region
 *   is what *names* it, and this is what makes it findable without reading — the sheet's own
 *   `data-current`, at the size a glance can use.
 */
export function FocusVisuals({
  name,
  colour,
  representationUrl,
  groups,
  currentIndex,
  imageUrls,
  reduceMotion,
}: {
  /** The block's meditation — what the accent and the glyph are chosen from. */
  name: string | null;
  /** The reader's own `colour`, when it is a hex value. */
  colour: string | null;
  /** The meditation's own picture, resolved to a blob URL, or `null`. */
  representationUrl: string | null;
  /** The block's symbols, in the order the block reads them. */
  groups: CompiledSymbolGroup[];
  /** Which of them the stage's clock has reached. */
  currentIndex: number;
  /** The run screen's picture cache, by media-asset id. */
  imageUrls: Record<string, string>;
  /** A reader who asked for less motion gets the picture still. */
  reduceMotion: boolean;
}): React.ReactNode {
  const accent = accentForMeditation({ name: name ?? "", colour });
  const breathe = reduceMotion ? "" : "animate-breathe";
  return (
    <div
      data-focus-visuals
      data-breathe={reduceMotion ? "off" : "on"}
      // The accent is the ink: every glyph below is `currentColor`, so one declaration
      // paints the picture and nothing else has to know which colour it is.
      style={{ color: accent.hex }}
      className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-hidden rounded-2xl border border-line bg-surface p-6"
    >
      <div data-focus-chakra className={`flex shrink-0 items-center justify-center ${breathe}`}>
        {representationUrl ? (
          <img
            src={representationUrl}
            alt={`${name ?? "This meditation"} representation`}
            className="h-48 w-48 rounded-3xl object-contain ring-2 ring-current sm:h-64 sm:w-64"
          />
        ) : (
          <ChakraGlyph
            name={name}
            className="h-48 w-48 drop-shadow-[0_0_18px_currentColor] sm:h-64 sm:w-64"
          />
        )}
      </div>
      {groups.length === 0 ? null : (
        <ul
          data-focus-symbols
          className="flex min-h-0 flex-wrap content-center items-center justify-center gap-x-8 gap-y-4 overflow-hidden"
        >
          {groups.map((group, index) => {
            const picture = group.imageAssetId ? imageUrls[group.imageAssetId] : undefined;
            return (
              <li
                key={`${index}-${group.name}`}
                data-focus-symbol
                data-current={index === currentIndex ? "true" : "false"}
                // Staggered so the symbols breathe in a round rather than in one breath:
                // a composition, which is what the owner asked for, and the same trick the
                // symbols sheet uses for its scatter.
                style={{ animationDelay: `${index * 0.7}s` }}
                className={`flex items-center justify-center ${breathe}`}
              >
                {picture ? (
                  <img
                    src={picture}
                    alt={`${group.name} symbol`}
                    className={`rounded-2xl object-contain ${
                      index === currentIndex ? "h-20 w-20" : "h-14 w-14 opacity-70"
                    }`}
                  />
                ) : (
                  <SymbolGlyph
                    name={group.name}
                    className={index === currentIndex ? "h-20 w-20" : "h-14 w-14 opacity-70"}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
