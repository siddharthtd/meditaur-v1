import type { ClientErrorPayload } from "@meditaur/domain";

/**
 * Caps for a recorded client error, in characters.
 *
 * A report is a signal, not a transcript. The stack of a Next render error runs
 * to thousands of characters of framework frames, and an unbounded one is a row
 * the owner has to scroll rather than read.
 */
export const CLIENT_ERROR_LIMITS = {
  message: 500,
  stack: 4000,
  route: 300,
} as const;

function clip(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

/**
 * Everything that leaves the browser for a `client_error`, in one place.
 *
 * Pure on purpose: what is sent is a privacy decision, and a privacy decision
 * that can only be exercised by triggering a real error is one nobody checks.
 * The route is reduced to its path — a query string can carry a token, and this
 * app's recovery links put one in the fragment — and every field is capped.
 * Nothing here reads the reader's material: a message, a stack and a path.
 */
export function clientErrorPayload(input: {
  message: string;
  stack?: string | null;
  route?: string | null;
}): ClientErrorPayload {
  return {
    message: clip(input.message, CLIENT_ERROR_LIMITS.message),
    stack: input.stack ? clip(input.stack, CLIENT_ERROR_LIMITS.stack) : null,
    route: input.route ? clip(input.route.split(/[?#]/)[0] ?? "", CLIENT_ERROR_LIMITS.route) : null,
  };
}
