import { describe, expect, it } from "vitest";
import { CLIENT_ERROR_LIMITS, clientErrorPayload } from "@meditaur/application";

/**
 * What leaves the browser when a screen throws.
 *
 * This is the privacy surface of the events table, and it is the half that is
 * easy to get wrong silently: a route with a token in it looks exactly like a
 * route without one until it is in a row somebody else can read.
 */
describe("a recorded client error", () => {
  it("keeps the path and drops the query string and fragment", () => {
    expect(clientErrorPayload({ message: "boom", route: "/run/abc?token=secret#access_token=secret" }).route).toBe(
      "/run/abc",
    );
  });

  it("caps every field, so one broken frame cannot fill a row", () => {
    const payload = clientErrorPayload({
      message: "m".repeat(CLIENT_ERROR_LIMITS.message + 50),
      stack: "s".repeat(CLIENT_ERROR_LIMITS.stack + 50),
      route: `/x${"y".repeat(CLIENT_ERROR_LIMITS.route + 50)}`,
    });
    expect(payload.message.length).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.message);
    expect(payload.stack?.length).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.stack);
    expect(payload.route?.length).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.route);
  });

  it("says nothing rather than guessing when there is no stack or route", () => {
    expect(clientErrorPayload({ message: "boom" })).toEqual({
      message: "boom",
      stack: null,
      route: null,
    });
  });
});
