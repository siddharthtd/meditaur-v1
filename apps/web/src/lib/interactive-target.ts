/**
 * Whether a press landed on something with a job of its own.
 *
 * A container that answers a press everywhere — a card, a table row — has to leave
 * the presses that belong to its own controls alone: the input, the picker chip, the
 * `×`. Both places that do this ask the same question, so it is asked once. It lives
 * in `lib/` rather than beside either of them because a shared rule that is written
 * twice drifts: the Library's card grew this guard first (the owner's fourth review,
 * library item 4: *"upper portion of the card executes the open view, lower portion is
 * still unresponsive"*) and the Database's rows needed the same answer in round 20.
 */
export function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, a, input, select, textarea, label") !== null
  );
}
