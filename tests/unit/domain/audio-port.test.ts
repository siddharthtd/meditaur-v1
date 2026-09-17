import { describe, expect, it } from "vitest";
import { RecordingAudioPort } from "@meditaur/domain";

describe("RecordingAudioPort", () => {
  it("records master volume and alarm volume", () => {
    const audio = new RecordingAudioPort();
    audio.setMasterVolume(0.7);
    audio.setAlarmVolume(0.4);
    expect(audio.calls).toEqual(["setMasterVolume:0.7", "setAlarmVolume:0.4"]);
  });
});
