import type {
  V2CandidateEnvelope,
  V2CandidateId,
  V2IsoDateTime,
  V2ReleasePreflightResponse,
  V2Revision,
  V2RunId,
  V2SceneCandidatePayload,
  V2SceneId,
  V2StoryWorldId,
} from "@living-network/contracts";

export const v2WebFixtureWorld = {
  storyWorldId: "world_v2_demo" as V2StoryWorldId,
  name: "Gate 0 Demo World",
  revision: 1 as V2Revision,
} as const;

export const v2WebFixtureSceneGraph = {
  entrySceneId: "scene_opening" as V2SceneId,
  scenes: [
    {
      sceneId: "scene_opening" as V2SceneId,
      title: "Opening Scene",
      choiceCount: 1,
    },
  ],
} as const;

export const v2WebFixtureCandidate = {
  candidateId: "candidate_scene_opening" as V2CandidateId,
  kind: "scene",
  storyWorldId: v2WebFixtureWorld.storyWorldId,
  baseCanonRevision: 1 as V2Revision,
  status: "pending",
  payload: {
    scene: {
      sceneId: "scene_opening" as V2SceneId,
      title: "Opening Scene",
      body: "A minimal scene candidate used only for V2 web adapter tests.",
      participantCharacterIds: [],
    },
    choices: [
      {
        label: "Begin",
        targetSceneId: "scene_opening" as V2SceneId,
      },
    ],
    validationNotes: [],
  },
  provenance: {
    source: "llm",
    jobId: "job_scene_opening",
    contextHash: "sha256:gate0",
    summary: "Minimal V2 web candidate fixture",
  },
  createdAt: "2026-08-12T00:00:00.000Z" as V2IsoDateTime,
} as const satisfies V2CandidateEnvelope<V2SceneCandidatePayload>;

export const v2WebFixtureRelease = {
  storyWorldId: v2WebFixtureWorld.storyWorldId,
  revision: 1 as V2Revision,
  valid: true,
  issues: [],
} as const satisfies V2ReleasePreflightResponse;

export const v2WebFixtureRun = {
  runId: "run_demo" as V2RunId,
  releaseVersion: "0.0.1",
  currentSceneId: "scene_opening",
} as const;
