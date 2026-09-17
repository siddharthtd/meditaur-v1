import { describe, expect, it } from "vitest";
import { countSessionsThisWeek } from "@meditaur/application";

describe("countSessionsThisWeek", () => {
  it("counts logs from local Monday through now", () => {
    const wednesday = new Date(2026, 8, 9, 15, 0, 0, 0).getTime();
    const monday = new Date(2026, 8, 7, 0, 0, 0, 0).getTime();
    const sundayBefore = new Date(2026, 8, 6, 23, 59, 0, 0).getTime();
    const laterThisWeek = new Date(2026, 8, 10, 8, 0, 0, 0).getTime();
    expect(
      countSessionsThisWeek(
        [
          { completedAt: sundayBefore },
          { completedAt: monday },
          { completedAt: wednesday },
          { completedAt: laterThisWeek },
        ],
        wednesday,
      ),
    ).toBe(2);
  });
});
