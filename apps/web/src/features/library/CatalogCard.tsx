import { Button } from "@meditaur/ui";
import type { CSSProperties, ReactNode } from "react";
import { ImageFrame } from "./ImageFrame";

/**
 * One catalogue entry in cards mode — UI_DESIGN.md §3.2.
 *
 * The card used to *be* a button, which meant the only way in was to guess that
 * the whole row was tappable, and nothing at all could sit inside it. It is a
 * container now, and pressing it anywhere opens the entry's read-only view
 * (`onOpen`) — that is the card's default action, so there is no `Open` button
 * to find. The named `Edit` and `Delete` actions sit at the bottom of the row
 * they belong to, painted above the open target: `Delete` carries the trash icon
 * and arms before it fires (the second press becomes `Delete <name>?`), and any
 * extra action the section needs is passed in as `actions`.
 *
 * Pressing *anywhere* includes the strip the actions sit in. The open target is
 * a sibling painted underneath that row, so the row's own background swallowed
 * the press: the owner's round 6 report is exact — "clicking on the upper
 * portion of the card executes the open view, lower portion is still
 * unresponsive". The container therefore answers a press everywhere the buttons
 * do not, and a press that lands on one of them is left to that button.
 */
/** True when a press landed on something inside the card that has its own job. */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, a, input, select, textarea, label") !== null
  );
}
export function CatalogCard({
  title,
  subtitle,
  imageSrc,
  imageAlt,
  imageClassName = "h-12 w-12",
  imageStyle,
  notice,
  actions,
  editLabel = "Edit",
  onOpen,
  onEdit,
  deleteArmed = false,
  deleteNotice = null,
  onDelete,
}: {
  title: string;
  subtitle?: string;
  /** Omit for a card with no picture; `null` renders the empty frame. */
  imageSrc?: string | null;
  imageAlt?: string;
  imageClassName?: string;
  imageStyle?: CSSProperties;
  /** A small line under the subtitle, e.g. a preview of a custom field. */
  notice?: ReactNode;
  /** Extra actions, before `Edit` and `Delete`. */
  actions?: ReactNode;
  editLabel?: string;
  /** The card's default action: the entry's read-only view. */
  onOpen?: () => void;
  /**
   * The card's own actions. Absent for the browse tabs, which have none at all
   * (§8): a chakra's picture, its kind and its name are what the page is for,
   * and editing it is the Database's record view.
   */
  onEdit?: () => void;
  deleteArmed?: boolean;
  /** What else the delete would take with it, shown while armed. */
  deleteNotice?: string | null;
  onDelete?: () => void;
}) {
  return (
    <div
      className="relative flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
      // The press that lands between or beside the buttons. A press that lands
      // *on* one of them is not this handler's to answer: the button's own
      // `onClick` fires for it, and the two would otherwise both run.
      onClick={
        onOpen
          ? (event) => {
              if (isInteractive(event.target)) return;
              onOpen();
            }
          : undefined
      }
    >
      {/* A full-card target rather than a click handler on the container: this
          gives the card one labelled, keyboard-reachable default action, which
          a click handler on a `div` cannot. The action row below is positioned,
          so it paints above and still wins. */}
      {onOpen ? (
        <button
          type="button"
          aria-label={`Open ${title}`}
          className="absolute inset-0 rounded-2xl active:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={onOpen}
        />
      ) : null}
      <div className="flex items-start gap-3">
        {imageSrc === undefined ? null : (
          <ImageFrame
            src={imageSrc}
            alt={imageAlt ?? title}
            className={imageClassName}
            style={imageStyle}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-lg text-text">{title}</p>
          {subtitle ? <p className="line-clamp-2 text-sm text-muted">{subtitle}</p> : null}
          {notice}
        </div>
      </div>
      {deleteArmed && deleteNotice ? (
        <p className="text-sm text-destructive">{deleteNotice}</p>
      ) : null}
      <div className="relative flex flex-wrap items-center justify-end gap-2">
        {actions}
        {onEdit ? (
          <Button size="sm" aria-label={`${editLabel} ${title}`} onClick={onEdit}>
            {editLabel}
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            size="sm"
            tier="destructive"
            armed={deleteArmed}
            aria-label={deleteArmed ? `Delete ${title}?` : `Delete ${title}`}
            onClick={onDelete}
          >
            {deleteArmed ? `Delete ${title}?` : "Delete"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
