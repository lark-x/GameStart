import type {
  V2CandidateEnvelope,
  V2CandidateId,
  V2IdempotencyKey,
  V2IsoDateTime,
  V2JobId,
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

export const v2WebFixtureGeneration = {
  context: {
    baseCanonRevision: 2,
    contextHash: "sha256:gate0-web-context",
    tokenBudget: 1200,
    sources: [
      { id: "world_v2_demo", label: "Gate 0 Demo World", kind: "world" },
      { id: "char_archivist", label: "The Archivist", kind: "character" },
      { id: "loc_archive", label: "Civic Archive", kind: "location" },
      { id: "fact_ticket", label: "Mira ticket fact", kind: "fact" },
    ],
  },
  job: {
    jobId: "job_scene_opening" as V2JobId,
    status: "succeeded",
    createdAt: "2026-08-12T00:00:00.000Z" as V2IsoDateTime,
    updatedAt: "2026-08-12T00:01:10.000Z" as V2IsoDateTime,
    promptPreview: "Generate a single reviewed scene candidate at the archive door.",
    terminalMessage: "Candidate submitted for creator review.",
  },
  diff: {
    title: "Opening Scene candidate",
    scope: ["scene body", "2 choices", "trust_archivist delta"],
    additions: [
      "Adds a concise scene body for the Rain Station opening.",
      "Adds a choice leading toward the Civic Archive.",
      "Suggests trust_archivist +1 as a candidate state delta.",
    ],
    warnings: ["Base revision must still be 2 before approval."],
  },
} as const;

export const v2WebDefaultGenerationRequest = {
  storyWorldId: v2WebFixtureWorld.storyWorldId,
  baseCanonRevision: 2 as V2Revision,
  prompt: "Generate a scene candidate that tests the archive mystery without changing canon.",
  idempotencyKey: "idem_web_scene_generation" as V2IdempotencyKey,
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
  revision: 2 as V2Revision,
  valid: true,
  issues: [],
} as const satisfies V2ReleasePreflightResponse;

export const v2WebFixtureReleasePackage = {
  releaseId: "release_demo_001",
  version: "0.1.0",
  manifestHash: "sha256:release-demo-001",
  immutable: true,
  createdAt: "2026-08-12T00:02:00.000Z",
  exportFormats: ["json", "markdown"],
} as const;

export const v2WebFixtureRun = {
  runId: "run_demo" as V2RunId,
  releaseVersion: "0.1.0",
  currentSceneId: "scene_opening",
} as const;

export const v2WebFixturePlayer = {
  sceneId: "scene_opening",
  title: "Opening Scene",
  body: "Rain taps the glass roof of the station while Mira studies the ticket's impossible scene ID.",
  choices: [
    {
      choiceId: "choice_archive",
      label: "Follow the stamped route to the Civic Archive",
      targetSceneId: "scene_archive",
      disabled: false,
    },
    {
      choiceId: "choice_wait",
      label: "Wait for the Archivist",
      targetSceneId: "scene_opening",
      disabled: false,
    },
  ],
  choiceHistory: [],
} as const;

export const v2WebFixtureSave = {
  saveId: "save_demo_001",
  label: "Station checkpoint",
  runId: v2WebFixtureRun.runId,
  releaseVersion: v2WebFixtureRun.releaseVersion,
  currentSceneId: v2WebFixturePlayer.sceneId,
  savedAt: "2026-08-12T00:03:00.000Z",
} as const;

export const v2WebFixtureExportBundle = {
  filename: "gate-0-demo-world-0.1.0.json",
  format: "json",
  preview: "{\n  \"releaseVersion\": \"0.1.0\",\n  \"entrySceneId\": \"scene_opening\"\n}",
} as const;
