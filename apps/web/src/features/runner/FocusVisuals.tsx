import { accentForMeditation } from "@meditaur/ui";
import type { CompiledSymbolGroup } from "@meditaur/domain";
import { ChakraGlyph, SymbolGlyph } from "./focus-glyphs";
import { ringPositions } from "./session-regions";

/**
 * What a Focus stage draws — the owner's rounds 20 and 26.
 *
 * Round 20 asked for the artwork: *"During focus, we would want to show beautiful visuals of the
 * chakra's picture in its colour, as well as all the symbols in the same colour breathing etc.
 * occupying the entire space that was earlier occupied by the intentions table."* Round 26 then
 * moved the big-symbol-plus-line composition to the **symbols** stage and gave this one its own
 * shape: *"For the Focus stage, I want all the symbols in a circle (without any boxes like they
 * are today), all of the same size, all of them breathing"* — with the meditation *"at the centre
 * of the circle — the symbols ring the meditation"*.
 *
 * Four deliberate choices:
 *
 * - **The picture is drawn as ink, not as a wash.** The accent is `currentColor` on every
 *   stroke, so the region reads as a drawing on the screen's own surface. The design rules
 *   forbid a large background wash, and this is the largest surface the app has.
 * - **The size never varies.** Every symbol on the ring is the same box, which is the ask read
 *   literally: what says which one the clock has reached is the rail beside the region, and on
 *   the ring only how strongly it is drawn.
 * - **The breathing is honest about `prefers-reduced-motion`.** A reader who asked their
 *   machine for less motion gets the same picture, still — the same rule the intentions column
 *   follows — which is why the state is on the DOM as `data-breathe` rather than only in a
 *   class name.
 * - **The glow is painted, not filtered.** The centre is wrapped in a static radial gradient
 *   rather than carrying a `drop-shadow`: a filter on an animating subtree is re-rasterised
 *   every frame, which is exactly the frame-by-frame growth the owner reported on the old
 *   focus stage.
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
  const spots = ringPositions(groups.length);
  return (
    <div
      data-focus-visuals
      data-breathe={reduceMotion ? "off" : "on"}
      // The accent is the ink: every glyph below is `currentColor`, so one declaration
      // paints the picture and nothing else has to know which colour it is.
      style={{ color: accent.hex }}
      className="flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface p-4"
    >
      {/* The ring's own box: square, as large as the region and the viewport allow, and the
          positions inside it are percentages of it (`ringPositions`). */}
      <div
        data-focus-ring
        className="relative aspect-square h-full max-h-[min(30rem,78vh)] w-auto max-w-full"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-56 sm:w-56"
          style={{
            background: "radial-gradient(circle, currentColor 0%, transparent 70%)",
            opacity: 0.16,
          }}
        />
        {/* The meditation, still, at the centre of the ring. */}
        <div
          data-focus-chakra
          className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center sm:h-36 sm:w-36"
        >
          {representationUrl ? (
            <img
              src={representationUrl}
              alt={`${name ?? "This meditation"} representation`}
              className="h-full w-full rounded-3xl object-contain"
            />
          ) : (
            <ChakraGlyph name={name} className="h-full w-full" />
          )}
        </div>
        {groups.map((group, index) => {
          const spot = spots[index] ?? { x: 50, y: 50 };
          const picture = group.imageAssetId ? imageUrls[group.imageAssetId] : undefined;
          return (
            <div
              key={`${index}-${group.name}`}
              className="absolute"
              // The placement is its own box's, so the breathing transform below never has to
              // share a declaration with it (`translate` and the animation's `transform` would
              // otherwise fight over the same element).
              style={{ left: `${spot.x}%`, top: `${spot.y}%`, transform: "translate(-50%, -50%)" }}
            >
              <div
                data-focus-symbol
                data-current={index === currentIndex ? "true" : "false"}
                // Staggered so the ring breathes in a round rather than in one breath: a
                // composition, which is what the owner asked for.
                style={{ animationDelay: `${index * 0.7}s` }}
                className={`flex h-16 w-16 items-center justify-center sm:h-24 sm:w-24 ${breathe} ${
                  index === currentIndex ? "opacity-100" : "opacity-65"
                }`}
              >
                {picture ? (
                  <img
                    src={picture}
                    alt={`${group.name} symbol`}
                    className="h-full w-full rounded-2xl object-contain"
                  />
                ) : (
                  <SymbolGlyph name={group.name} className="h-full w-full" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
