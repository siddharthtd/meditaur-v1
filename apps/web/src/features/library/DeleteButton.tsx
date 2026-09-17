import { Button, type ButtonSize } from "@meditaur/ui";

/**
 * A destructive button with its arm step, and the line that says what else goes.
 *
 * Deleting is a cascade in this product (IMPLEMENTATION.md's UI rules), so the
 * first press has to answer "what else?" before the second one fires: the button
 * fills, and `getDeletionImpact` supplies the sentence under it ("This also
 * removes 3 blocks from 2 plans."). One component rather than the ternary, the
 * fill, and the sentence repeated across every editor.
 */
export function DeleteButton({
  label,
  armedLabel,
  armed,
  impact = null,
  onClick,
  size = "md",
  className = "",
}: {
  label: string;
  /** What the button says once armed, e.g. `Delete Heart Chakra?`. */
  armedLabel: string;
  armed: boolean;
  /** The impact sentence, shown while armed. Empty or null to say nothing. */
  impact?: string | null;
  onClick: () => void;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-2 ${className}`}>
      <Button tier="destructive" size={size} armed={armed} onClick={onClick}>
        {armed ? armedLabel : label}
      </Button>
      {armed && impact ? <p className="text-sm text-destructive">{impact}</p> : null}
    </div>
  );
}
