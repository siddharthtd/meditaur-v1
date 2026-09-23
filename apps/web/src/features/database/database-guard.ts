/**
 * The Database's unsaved-edits guard, kept outside React on purpose.
 *
 * The Database is a screen of its own now, so "are there unsaved edits?" has to
 * be answerable by something that is *not* the screen — the nav bar, which can
 * unmount it with one press. The screen publishes its state here, and every door
 * out asks this module before it moves (§12.24: the Database is the one place
 * where leaving discards).
 *
 * It is a module-level boolean rather than a context because the reader is a
 * client component in the app shell, the writer is a screen in a route, and both
 * are mounted inside the same page: one process, one flag.
 */
let unsaved = false;

/** Published by the Database screen whenever its draft changes. */
export function setDatabaseDirty(next: boolean): void {
  unsaved = next;
}

export function databaseIsDirty(): boolean {
  return unsaved;
}

/**
 * Ask before leaving the Database with unsaved edits.
 *
 * Answers `true` when it is safe to go — which includes the common case of a
 * clean screen, where nothing is asked at all.
 */
export function confirmLeaveDatabase(): boolean {
  if (!unsaved) return true;
  return window.confirm("Leave the Database? Your unsaved changes will be discarded.");
}
