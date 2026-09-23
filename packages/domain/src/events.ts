/**
 * What the app records about itself.
 *
 * One event type today — a client error — and the shape is the one the 2026-09-17
 * hardening review asked for (its items, and what became of each, are in
 * docs/HISTORY.md; the review's error-capture finding): the analytics events
 * table with `client_error` as its first type, rather than a second mechanism
 * stood up beside it. The analytics item (`P2 · 2`) adds types; nothing else about this changes.
 */
export type AppEventType = "client_error";

/**
 * The payload of a `client_error`, already capped and stripped.
 *
 * Neither field is the reader's material: a message, a stack, and the path the
 * screen was on. The route deliberately has no query string or fragment, because
 * the one link in this app that carries anything secret puts it in the fragment.
 */
export type ClientErrorPayload = {
  message: string;
  stack: string | null;
  route: string | null;
};

/**
 * One recorded event.
 *
 * `id` is the idempotency key: writing the same event twice under one id is the
 * same event, not two. `userId` is null when nobody is signed in, which is the
 * ordinary state of a device-only build rather than an error.
 */
export type AppEvent = {
  id: string;
  workspaceId: string;
  userId: string | null;
  eventType: AppEventType;
  payload: ClientErrorPayload;
  occurredAt: number;
};
