import { CATALOG_BACKUP_ERRORS } from "@meditaur/application";
import { AppError } from "@meditaur/domain";
import { describe, expect, it } from "vitest";
import {
  catalogRestoreError,
  errorCode,
  errorText,
} from "../../../apps/web/src/lib/error-text.ts";

describe("errorText", () => {
  it("prefers AppError message and exposes the code", () => {
    const err = new AppError("plan.missing", "That plan is gone.");
    expect(errorText(err, "fallback")).toBe("That plan is gone.");
    expect(errorCode(err)).toBe("plan.missing");
  });

  it("uses a generic Error message, then the fallback", () => {
    expect(errorText(new Error("boom"), "fallback")).toBe("boom");
    expect(errorText("nope", "fallback")).toBe("fallback");
    expect(errorCode("nope")).toBeUndefined();
  });
});

describe("catalogRestoreError", () => {
  it("maps JSON parse and backup codes, not message equality", () => {
    expect(catalogRestoreError(new SyntaxError("Unexpected token"))).toBe(
      CATALOG_BACKUP_ERRORS.invalid,
    );
    expect(catalogRestoreError(new AppError("catalogBackup.invalid", "x"))).toBe(
      CATALOG_BACKUP_ERRORS.invalid,
    );
    expect(catalogRestoreError(new AppError("catalogBackup.version", "x"))).toBe(
      CATALOG_BACKUP_ERRORS.version,
    );
    expect(catalogRestoreError(new AppError("media.tooLarge", "Audio file must be 10 MB or smaller"))).toBe(
      "Audio file must be 10 MB or smaller",
    );
    expect(catalogRestoreError(0)).toBe("Could not restore catalog");
  });
});
