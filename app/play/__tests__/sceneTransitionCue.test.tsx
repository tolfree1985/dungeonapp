import { describe, expect, it } from "vitest";
import type { SceneTransition } from "@/lib/resolveSceneTransition";
import { deriveSceneTransitionCue } from "@/app/play/client";

describe("deriveSceneTransitionCue", () => {
  it("returns Focus Shift when advance loses focus", () => {
    const transition: SceneTransition = {
      type: "advance",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: false,
      focusHeld: false,
    };

    expect(deriveSceneTransitionCue(transition)).toBe("Focus Shift");
  });

  it("returns Camera Push-In when the camera escalates", () => {
    const transition: SceneTransition = {
      type: "advance",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
      focusHeld: true,
      shouldEscalateCamera: true,
    };

    expect(deriveSceneTransitionCue(transition)).toBe("Camera Push-In");
  });

  it("returns null for hold transitions", () => {
    const transition: SceneTransition = {
      type: "hold",
      preserveFraming: true,
      preserveSubject: true,
      preserveActor: true,
      preserveFocus: true,
      focusHeld: true,
    };

    expect(deriveSceneTransitionCue(transition)).toBeNull();
  });

  it("returns null for cuts", () => {
    const transition: SceneTransition = {
      type: "cut",
      preserveFraming: false,
      preserveSubject: false,
      preserveActor: false,
      preserveFocus: false,
      focusHeld: false,
    };

    expect(deriveSceneTransitionCue(transition)).toBeNull();
  });
});
