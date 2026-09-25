import type { JSX } from "react";

/**
 * The pictures a Focus stage draws: a chakra's own glyph, and a glyph per symbol.
 *
 * The owner's round 20: *"During focus, we would want to show beautiful visuals of the
 * chakra's picture in its colour, as well as all the symbols in the same colour breathing
 * etc. occupying the entire space that was earlier occupied by the intentions table this is a
 * next to-do item, it will require you to design icons for chakras as well as symbols."*
 *
 * Three rules shape what is here:
 *
 * - **Drawn, not filled.** Every glyph is a line drawing in `currentColor`, so the accent —
 *   the chakra's hue, or the reader's own override — is the ink. The design rules forbid a
 *   large background wash, and a session screen is the largest surface the app has.
 * - **A chakra's petals are its own.** The seven centres are traditionally drawn with 4, 6,
 *   10, 12, 16, 2 and (nominally) 1000 petals; the count is the one thing that tells them
 *   apart at a glance, so it is data here rather than decoration. The Crown is a bloom rather
 *   than a thousand petals — a picture of a thousand petals is a smudge.
 * - **Anything else is a place, not a centre.** A point (`Liver`, `Thighs`) or a custom
 *   meditation gets a location mark: concentric circles. It is honest about being neither a
 *   chakra nor one of the four symbols below.
 *
 * Nothing here reaches for an asset: a reader's own picture of a chakra or a symbol is drawn
 * by `FocusVisuals` *instead* of the glyph, which is why this file is pure and unit-tested.
 */

/** The seven centres' petal counts. Anything else is not a chakra. */
const PETALS: Record<string, number> = {
  "third eye": 2,
  root: 4,
  hara: 6,
  "solar plexus": 10,
  heart: 12,
  throat: 16,
  // The bloom. The tradition says a thousand; the count that reads as "more than every
  // other centre" is two rings' worth, which is what `ChakraGlyph` draws when this is
  // returned (see `RINGS`).
  crown: 24,
};

function keyOf(name: string | null | undefined): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    // The catalogue writes `Third-Eye Chakra` and this file's table writes `third eye`, so
    // a hyphen is not part of a name — the same reading `FOCUS_ORDER` uses.
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ chakra$/, "");
}

/** How many petals a meditation's glyph has, or `0` for a place rather than a centre. */
export function petalsFor(name: string | null | undefined): number {
  return PETALS[keyOf(name)] ?? 0;
}

/**
 * The four symbols that have a glyph of their own.
 *
 * Only these four: they are the ones the owner asked to have planted on every chakra and
 * point (round 21), which makes them the ones a reader meets in a circuit. Everything else —
 * the Karuna rows the app shipped, and a reader's own symbol — is drawn as a rosette, and a
 * symbol with an uploaded picture is drawn as that picture instead.
 */
const DESIGNED: Record<string, (props: GlyphProps) => JSX.Element> = {
  "hon sha ze sho nen": HonShaZeShoNen,
  "sei hei ki": SeiHeiKi,
  "cho ku rei": ChoKuRei,
  "dai kyo mo": DaiKyoMo,
};

export function hasDesignedSymbol(name: string | null | undefined): boolean {
  return DESIGNED[keyOf(name)] !== undefined;
}

type GlyphProps = { className?: string };

const BASE = "stroke-current fill-none";
/** One weight and one set of joins for every line in every glyph: these are drawings, and a
 *  drawing that changes its hand between two pictures on one screen is two drawings. */
const LINE = { strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="presentation" aria-hidden="true">
      <g className={BASE} {...LINE}>
        {children}
      </g>
    </svg>
  );
}

/** One petal, pointing away from the centre at `angle` degrees. */
function petal(angle: number, radius: number, rx: number, ry: number, key: string) {
  const rad = (angle * Math.PI) / 180;
  const cx = 50 + radius * Math.cos(rad);
  const cy = 50 + radius * Math.sin(rad);
  return (
    <ellipse
      key={key}
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      transform={`rotate(${angle + 90} ${cx} ${cy})`}
    />
  );
}

/**
 * A centre, drawn as a lotus: a rim of `petals` scallops around a seed.
 *
 * The petals are one closed path of quadratic bumps on a rim, which is what a hand-drawn
 * lotus is — a circle whose edge is `n` petals rather than a diamond of ellipses, which is
 * what the first cut drew and what a reader could not tell from a smudge. A place on the body
 * has no petal count, so it gets a location mark instead: rings.
 */
export function ChakraGlyph({ name, className }: { name: string | null; className?: string }) {
  const petals = petalsFor(name);
  if (petals === 0) {
    return (
      <Frame className={className}>
        <circle cx={50} cy={50} r={34} />
        <circle cx={50} cy={50} r={18} />
        <circle cx={50} cy={50} r={3} fill="currentColor" stroke="none" />
      </Frame>
    );
  }
  const rim = petals > 16 ? 30 : 28;
  const lift = petals > 16 ? 5 : 9;
  return (
    <Frame className={className}>
      <path d={scallop(petals, rim, lift)} />
      <circle cx={50} cy={50} r={9} />
      <circle cx={50} cy={50} r={2.5} fill="currentColor" stroke="none" />
    </Frame>
  );
}

/**
 * One closed path: `count` petals as bumps on a rim of `radius`, each `lift` taller than the
 * rim it sits on. Starts at the top and runs clockwise, so the drawing is the same on every
 * render and in every test.
 *
 * The control point sits at **twice** the lift, because a quadratic only reaches halfway to
 * its control: at equal distances the petals come out a 4-unit swell on a 28-unit rim, which
 * is a circle with a tremor rather than a lotus (measured in the browser at 192px, which is
 * where "looks like a circle" was caught rather than reasoned about).
 */
function scallop(count: number, radius: number, lift: number): string {
  const step = (Math.PI * 2) / count;
  const at = (angle: number, r: number) =>
    `${(50 + r * Math.cos(angle)).toFixed(1)} ${(50 + r * Math.sin(angle)).toFixed(1)}`;
  let path = "";
  for (let petal = 0; petal < count; petal += 1) {
    const from = -Math.PI / 2 + petal * step;
    const to = from + step;
    path += `${petal === 0 ? "M" : "L"}${at(from, radius)} `;
    path += `Q${at(from + step / 2, radius + lift * 2)} ${at(to, radius)} `;
  }
  return `${path}Z`;
}

/** A symbol's glyph: its own shape for the four the owner named, a rosette otherwise. */
export function SymbolGlyph({ name, className }: { name: string | null; className?: string }) {
  const designed = DESIGNED[keyOf(name)];
  if (designed) return <Frame className={className}>{designed({})}</Frame>;
  return (
    <Frame className={className}>
      <circle cx={50} cy={50} r={30} />
      {Array.from({ length: 6 }, (_, at) => petal(at * 60, 20, 5, 10, `s-${at}`))}
      <circle cx={50} cy={50} r={5} />
    </Frame>
  );
}

function ChoKuRei() {
  // The power symbol: a stem, its bar, and the curl that turns away from it.
  return (
    <>
      <path d="M50 16 V30" />
      <path d="M41 16 H59" />
      <path d="M50 30 C 34 33 29 48 38 58 C 47 68 63 62 62 49 C 61 40 51 37 45 42" />
    </>
  );
}

function SeiHeiKi() {
  // The mental-emotional symbol: two arcs mirrored about a stem, which is what the
  // tradition draws — the left and right halves of one motion.
  return (
    <>
      <path d="M50 16 V84" />
      <path d="M34 26 C 22 38 22 54 36 66" />
      <path d="M66 26 C 78 38 78 54 64 66" />
    </>
  );
}

function HonShaZeShoNen() {
  // The distance symbol: a zigzag over a base, with the stem that carries it.
  return (
    <>
      <path d="M28 22 H72 L28 54 H72" />
      <path d="M50 54 V80" />
      <path d="M34 80 H66" />
    </>
  );
}

function DaiKyoMo() {
  // The master symbol: a stem, a crossbar, and a hook that turns back on itself.
  return (
    <>
      <path d="M50 16 V64" />
      <path d="M34 26 H66" />
      <path d="M50 64 C 62 64 66 74 58 82" />
      <path d="M58 82 C 52 87 46 84 47 79" />
    </>
  );
}
