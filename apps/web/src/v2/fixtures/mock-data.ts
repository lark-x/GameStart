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
  revision: 2 as V2Revision,
  premise: "A local-first mystery about creators testing a sealed city before release.",
  characters: [
    {
      characterId: "char_archivist",
      name: "The Archivist",
      role: "creator guide",
    },
    {
      characterId: "char_runner",
      name: "Mira Runner",
      role: "player character",
    },
  ],
  locations: [
    {
      locationId: "loc_station",
      name: "Rain Station",
      tags: ["entry", "safe"],
    },
    {
      locationId: "loc_archive",
      name: "Civic Archive",
      tags: ["locked", "canon"],
    },
  ],
  facts: [
    {
      factId: "fact_clock",
      text: "The city clock resets whenever a release candidate is rejected.",
      visibility: "creator",
    },
    {
      factId: "fact_ticket",
      text: "Mira carries a ticket stamped with an unknown scene ID.",
      visibility: "player",
    },
  ],
  rules: [
    {
      ruleId: "rule_candidate_review",
      text: "External output must remain a candidate until creator approval.",
      severity: "hard",
    },
  ],
} as const;

export const v2WebFixtureSceneGraph = {
  entrySceneId: "scene_opening" as V2SceneId,
  scenes: [
    {
      sceneId: "scene_opening" as V2SceneId,
      title: "Opening Scene",
      choiceCount: 2,
      reachable: true,
      stateDeltaPreview: [
        {
          key: "trust_archivist",
          before: 0,
          after: 1,
          sourceSceneId: "scene_opening",
        },
      ],
    },
    {
      sceneId: "scene_archive" as V2SceneId,
      title: "Archive Door",
      choiceCount: 1,
      reachable: true,
      stateDeltaPreview: [
        {
          key: "archive_unlocked",
          before: false,
          after: true,
          sourceSceneId: "scene_archive",
        },
      ],
    },
    {
      sceneId: "scene_rooftop" as V2SceneId,
      title: "Rooftop Signal",
      choiceCount: 0,
      reachable: false,
      stateDeltaPreview: [],
    },
  ],
  diagnostics: [
    {
      code: "unreachable_scene",
      severity: "warning",
      message: "Rooftop Signal has no incoming reviewed choice yet.",
      targetId: "scene_rooftop",
    },
    {
      code: "state_delta",
      severity: "info",
      message: "Opening Scene increases trust_archivist from 0 to 1.",
      targetId: "scene_opening",
    },
  ],
} as const;

export const v2WebFixtureTypedState = {
  schemaRevision: 1,
  variables: [
    {
      key: "trust_archivist",
      label: "Trust in Archivist",
      type: "number",
      value: 0,
    },
    {
      key: "archive_unlocked",
      label: "Archive Door Unlocked",
      type: "flag",
      value: false,
    },
    {
      key: "active_lead",
      label: "Active Lead",
      type: "text",
      value: "ticket",
    },
  ],
  preview: [
    {
      key: "trust_archivist",
      before: 0,
      after: 1,
      sourceSceneId: "scene_opening",
    },
    {
      key: "archive_unlocked",
      before: false,
      after: true,
      sourceSceneId: "scene_archive",
    },
  ],
} as const;

export const v2WebFixtureCandidate = {
  candidateId: "candidate_scene_opening" as V2CandidateId,
  kind: "scene",
  storyWorldId: v2WebFixtureWorld.storyWorldId,
  baseCanonRevision: 2 as V2Revision,
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
