import { describe, expect, it } from "vitest";
import { clonePreset } from "@meditaur/application";
import { makePreset } from "../../fixtures/library.ts";

describe("clonePreset", () => {
  it("mints a new id and does not share tone arrays", () => {
    const source = makePreset({ name: "Theta 8 Hz" });
    const copy = clonePreset(source, { id: "preset2", name: "Theta 8 Hz copy" });
    expect(copy.id).toBe("preset2");
    expect(copy.name).toBe("Theta 8 Hz copy");
    expect(copy.leftTones).toEqual(source.leftTones);
    copy.leftTones[0].hz = 999;
    copy.eqLeft.bands[0].gainDb = 6;
    expect(source.leftTones[0].hz).not.toBe(999);
    expect(source.eqLeft.bands[0].gainDb).toBe(0);
    expect(source.id).toBe("preset1");
  });
});
