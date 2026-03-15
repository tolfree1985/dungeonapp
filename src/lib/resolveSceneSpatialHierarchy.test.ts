import { describe, expect, it } from "vitest";
import { resolveSceneSpatialHierarchy } from "@/lib/resolveSceneSpatialHierarchy";
import type { SceneActorState } from "@/lib/resolveSceneActorState";
import type { SceneFocusState } from "@/lib/resolveSceneFocusState";
import type { SceneSubjectState } from "@/lib/resolveSceneSubjectState";
import type { SceneFramingState } from "@/lib/resolveSceneFramingState";

const baseFraming: SceneFramingState = {
  frameKind: "wide_environment",
  shotScale: "wide",
  subjectFocus: "environment",
  cameraAngle: "level",
};

const baseFocus: SceneFocusState = {
  focusType: "environment",
  focusId: "room",
  focusLabel: "Room",
};

const baseSubject: SceneSubjectState = {
  primarySubjectKind: "environment",
  primarySubjectId: "room",
  primarySubjectLabel: "Room",
};

const noActor: SceneActorState = {
  primaryActorId: null,
  primaryActorLabel: null,
  primaryActorRole: null,
  actorVisible: false,
};

describe("resolveSceneSpatialHierarchy", () => {
  it("returns threat dominance when focus is threat", () => {
    const hierarchy = resolveSceneSpatialHierarchy({
      focusState: { ...baseFocus, focusType: "threat" },
      actorState: { ...noActor, primaryActorRole: "threat", actorVisible: true, primaryActorId: "g" },
      subjectState: { ...baseSubject, primarySubjectKind: "threat" },
      framingState: { ...baseFraming, subjectFocus: "threat" },
    });
    expect(hierarchy).toEqual({ primarySubject: "threat", secondarySubject: null, dominance: "primary-heavy" });
  });

  it("returns player/environment when focus is environment", () => {
    const hierarchy = resolveSceneSpatialHierarchy({
      focusState: baseFocus,
      actorState: noActor,
      subjectState: baseSubject,
      framingState: baseFraming,
    });
    expect(hierarchy).toEqual({ primarySubject: "environment", secondarySubject: null, dominance: "balanced" });
  });

  it("includes secondary threat when visible actor is threat", () => {
    const hierarchy = resolveSceneSpatialHierarchy({
      focusState: { ...baseFocus, focusType: "detail" },
      actorState: { ...noActor, actorVisible: true, primaryActorRole: "threat", primaryActorId: "g" },
      subjectState: baseSubject,
      framingState: baseFraming,
    });
    expect(hierarchy).toEqual({ primarySubject: "object", secondarySubject: "threat", dominance: "balanced" });
  });
});
