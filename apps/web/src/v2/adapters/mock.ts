import {
  type V2GenerationContextPreviewApiRequest,
  type V2CreateSceneGenerationJobApiRequest,
  type V2CreateSceneGenerationJobResponse,
  type V2IsoDateTime,
  type V2JobId,
  type V2PrepareAssetGenerationApiResponse,
  type V2Revision,
  type V2SceneGenerationPrepareApiResponse,
  type V2StoryWorldDto,
  type V2StoryWorldId,
} from "@living-network/contracts/v2";

import {
  v2WebFixtureAssets,
  v2WebFixtureCandidate,
  v2WebFixtureExportBundle,
  v2WebFixtureRelease,
  v2WebFixtureReleasePackage,
  v2WebFixtureRun,
  v2WebFixtureGeneration,
  v2WebFixturePlayer,
  v2WebFixtureSave,
  v2WebFixtureSceneGraph,
  v2WebFixtureTypedState,
  v2WebFixtureWorld,
} from "../fixtures/mock-data.ts";
import { V2AdapterError } from "./types.ts";
import type {
  V2ApprovedAssetSummary,
  V2ArcSummary,
  V2AssetGenerationRequestInput,
  V2AssetCandidateSummary,
  V2AssetJobSummary,
  V2AssetReviewRequest,
  V2AssetReviewResult,
  V2CandidateReviewRequest,
  V2CandidateReviewResult,
  V2CharacterSummary,
  V2ChoiceSummary,
  V2FactSummary,
  V2GraphDiagnostic,
  V2LocationSummary,
  V2RuleSummary,
  V2SceneGraphSummary,
  V2SceneSummary,
  V2StateVariableSummary,
  V2TimelineEventSummary,
  V2TypedStateSummary,
  V2WorkspaceAdapter,
  V2WorkspaceSnapshot,
  V2WorkspaceSummary,
} from "./types.ts";

const now = "2026-08-12T00:00:00.000Z" as V2IsoDateTime;
import type { V2GraphCreateInput } from "./types.ts";
import type { V2CanonUpdateInput, V2GraphUpdateInput } from "./types.ts";
import type { V2CanonCreateInput } from "./types.ts";

export function createV2MockSnapshot(): V2WorkspaceSnapshot {
  return {
    health: { ok: true, version: "v2" },
    world: v2WebFixtureWorld,
    sceneGraph: v2WebFixtureSceneGraph,
    typedState: v2WebFixtureTypedState,
    generation: v2WebFixtureGeneration,
    candidate: v2WebFixtureCandidate,
    release: v2WebFixtureRelease,
    releasePackage: v2WebFixtureReleasePackage,
    run: v2WebFixtureRun,
    player: v2WebFixturePlayer,
    save: v2WebFixtureSave,
    exportBundle: v2WebFixtureExportBundle,
    assets: v2WebFixtureAssets,
  };
}

export function createV2MockAdapter(): V2WorkspaceAdapter {
  // Mock 只记录创建的世界；快照仍返回固定 fixture（world_v2_demo），
  // 真实创建链路以 HTTP adapter + Core API 为准。
  const createdWorlds: V2StoryWorldDto[] = [];
  const fixtureWorld: V2StoryWorldDto = {
    storyWorldId: v2WebFixtureWorld.storyWorldId as V2StoryWorldId,
    name: v2WebFixtureWorld.name,
    summary: v2WebFixtureWorld.premise,
    revision: v2WebFixtureWorld.revision as V2Revision,
    createdAt: now,
    updatedAt: now,
  };
  let selectedWorldId = fixtureWorld.storyWorldId;
  let assetJob: V2AssetJobSummary = { ...v2WebFixtureAssets.job };
  let assetCandidate: V2AssetCandidateSummary | null = { ...v2WebFixtureAssets.candidate };
  const assetLibrary: V2ApprovedAssetSummary[] = [...v2WebFixtureAssets.library];
  const worldCharacters: V2CharacterSummary[] = v2WebFixtureWorld.characters.map((character) => ({ characterId: character.characterId, name: character.name, role: character.role }));
  const worldLocations: V2LocationSummary[] = v2WebFixtureWorld.locations.map((location) => ({ locationId: location.locationId, name: location.name, tags: [...location.tags] }));
  const worldFacts: V2FactSummary[] = v2WebFixtureWorld.facts.map((fact) => ({ factId: fact.factId, text: fact.text, visibility: fact.visibility }));
  const worldRules: V2RuleSummary[] = v2WebFixtureWorld.rules.map((rule) => ({ ruleId: rule.ruleId, text: rule.text, severity: rule.severity }));
  const worldTimelineEvents: V2TimelineEventSummary[] = v2WebFixtureWorld.timelineEvents.map((event) => ({ ...event }));
  const sceneArcs: V2ArcSummary[] = v2WebFixtureSceneGraph.arcs.map((arc) => ({ ...arc }));
  const sceneScenes: V2SceneSummary[] = v2WebFixtureSceneGraph.scenes.map((scene) => ({ ...scene }));
  const sceneChoices: V2ChoiceSummary[] = v2WebFixtureSceneGraph.choices.map((choice) => ({ ...choice, gates: choice.gates.map((gate) => ({ ...gate })), consequences: choice.consequences.map((consequence) => ({ ...consequence })) }));
  const sceneDiagnostics: V2GraphDiagnostic[] = v2WebFixtureSceneGraph.diagnostics.map((diagnostic) => ({ ...diagnostic }));
  const typedStateVariables: V2StateVariableSummary[] = v2WebFixtureTypedState.variables.map((variable) => ({ ...variable }));
  let worldState: V2WorkspaceSummary = {
    ...v2WebFixtureWorld,
    characters: worldCharacters,
    locations: worldLocations,
    facts: worldFacts,
    rules: worldRules,
    timelineEvents: worldTimelineEvents,
  };
  const sceneGraphState: V2SceneGraphSummary = {
    ...v2WebFixtureSceneGraph,
    arcs: sceneArcs,
    scenes: sceneScenes,
    choices: sceneChoices,
    diagnostics: sceneDiagnostics,
  };
  const typedStateState: V2TypedStateSummary = {
    ...v2WebFixtureTypedState,
    variables: typedStateVariables,
  };
  let graphCounter = 0;
  let canonCounter = 0;

  function bumpRevision(): void {
    const next = (fixtureWorld.revision + 1) as V2Revision;
    Object.assign(fixtureWorld, { revision: next });
    worldState = { ...worldState, revision: next };
  }

  return {
    mode: "mock",
    async bootstrapWorkspace(): Promise<void> {},
    async listStoryWorlds(): Promise<readonly V2StoryWorldDto[]> {
      return [fixtureWorld, ...createdWorlds];
    },
    async updateStoryWorld(input): Promise<V2StoryWorldDto> {
      const target = input.storyWorldId === fixtureWorld.storyWorldId ? fixtureWorld : createdWorlds.find((world) => world.storyWorldId === input.storyWorldId);
      if (!target) throw new Error("Story world not found");
      if (input.expectedRevision !== target.revision) {
        throw new V2AdapterError({ code: "STALE_REVISION", message: `Expected revision ${input.expectedRevision}, got ${target.revision}` });
      }
      const updated = { ...target, name: input.name, ...(input.summary === undefined ? {} : { summary: input.summary }), revision: (input.expectedRevision + 1) as V2Revision, updatedAt: now };
      if (target.storyWorldId === fixtureWorld.storyWorldId) Object.assign(fixtureWorld, updated);
      else Object.assign(createdWorlds[createdWorlds.indexOf(target)]!, updated);
      selectedWorldId = updated.storyWorldId;
      return updated;
    },

    async createStoryWorld(input: { readonly name: string; readonly summary?: string }): Promise<V2StoryWorldDto> {
      const world: V2StoryWorldDto = {
        storyWorldId: `world:mock-${createdWorlds.length + 1}` as V2StoryWorldId,
        name: input.name,
        ...(input.summary !== undefined && input.summary.trim() !== "" ? { summary: input.summary.trim() } : {}),
        revision: 1 as V2Revision,
        createdAt: now,
        updatedAt: now,
      };
      createdWorlds.push(world);
      return world;
    },
    async getSnapshot(storyWorldId?: string): Promise<V2WorkspaceSnapshot> {
      if (storyWorldId !== undefined) selectedWorldId = storyWorldId as V2StoryWorldId;
      const selected = [fixtureWorld, ...createdWorlds].find((world) => world.storyWorldId === selectedWorldId) ?? fixtureWorld;
      const snapshot = createV2MockSnapshot();
      return {
        ...snapshot,
        world: { ...worldState, storyWorldId: selected.storyWorldId, name: selected.name, premise: selected.summary ?? "", revision: selected.revision },
        sceneGraph: sceneGraphState,
        typedState: typedStateState,
        assets: { ...snapshot.assets, job: assetJob, candidate: assetCandidate, library: assetLibrary },
      };
    },
    async createCanonEntity(input: V2CanonCreateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void> {
      bumpRevision();
      canonCounter += 1;
      const suffix = `mock-${canonCounter}`;
      if (input.kind === "location") {
        worldLocations.push({ locationId: `location:${suffix}`, name: input.input.name, tags: input.input.summary ? [input.input.summary] : [] });
      } else if (input.kind === "character") {
        worldCharacters.push({ characterId: `character:${suffix}`, name: input.input.name, role: input.input.summary ?? "角色" });
      } else if (input.kind === "fact") {
        worldFacts.push({ factId: `fact:${suffix}`, text: input.input.text, visibility: input.input.visibility === "creator_only" ? "creator" : "player" });
      } else if (input.kind === "rule") {
        worldRules.push({ ruleId: `rule:${suffix}`, text: input.input.text, severity: input.input.severity === "required" ? "hard" : "soft" });
      } else if (input.kind === "timeline") {
        worldTimelineEvents.push({ timelineEventId: `timeline:${suffix}`, localDate: input.input.localDate, title: input.input.title, ...(input.input.summary === undefined ? {} : { summary: input.input.summary }) });
      }
    },
    async updateCanonEntity(input: V2CanonUpdateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void> {
      bumpRevision();
      if (input.kind === "location") {
        const index = worldLocations.findIndex((item) => item.locationId === input.id);
        if (index !== -1) worldLocations[index] = { ...worldLocations[index]!, name: input.input.name, tags: input.input.summary ? [input.input.summary] : [] };
      } else if (input.kind === "character") {
        const index = worldCharacters.findIndex((item) => item.characterId === input.id);
        if (index !== -1) worldCharacters[index] = { ...worldCharacters[index]!, name: input.input.name, role: input.input.summary ?? "角色" };
      } else if (input.kind === "fact") {
        const index = worldFacts.findIndex((item) => item.factId === input.id);
        if (index !== -1) worldFacts[index] = { ...worldFacts[index]!, text: input.input.text, visibility: input.input.visibility === "creator_only" ? "creator" : "player" };
      } else if (input.kind === "rule") {
        const index = worldRules.findIndex((item) => item.ruleId === input.id);
        if (index !== -1) worldRules[index] = { ...worldRules[index]!, text: input.input.text, severity: input.input.severity === "required" ? "hard" : "soft" };
      } else if (input.kind === "timeline") {
        const index = worldTimelineEvents.findIndex((item) => item.timelineEventId === input.id);
        if (index !== -1) worldTimelineEvents[index] = { ...worldTimelineEvents[index]!, localDate: input.input.localDate, title: input.input.title, ...(input.input.summary === undefined ? {} : { summary: input.input.summary }) };
      }
    },
    async createGraphEntity(input: V2GraphCreateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void> {
      bumpRevision();
      graphCounter += 1;
      const suffix = `mock-${graphCounter}`;
      if (input.kind === "arc") {
        sceneArcs.push({ arcId: `arc:${suffix}`, title: input.input.title, ...(input.input.summary === undefined ? {} : { summary: input.input.summary }) });
      } else if (input.kind === "scene") {
        sceneScenes.push({
          sceneId: `scene:${suffix}`,
          ...(input.input.arcId === undefined ? {} : { arcId: input.input.arcId }),
          title: input.input.title,
          ...(input.input.body === undefined ? {} : { body: input.input.body }),
          isEntry: input.input.isEntry ?? false,
          choiceCount: 0,
          reachable: true,
          stateDeltaPreview: [],
        });
      } else if (input.kind === "choice") {
        sceneChoices.push({
          choiceId: `choice:${suffix}`,
          sourceSceneId: input.input.sourceSceneId,
          ...(input.input.targetSceneId === undefined ? {} : { targetSceneId: input.input.targetSceneId }),
          label: input.input.label,
          gates: input.input.gates ?? [],
          consequences: input.input.consequences ?? [],
        });
      } else if (input.kind === "state") {
        const type = input.input.valueType === "boolean" ? "flag" : input.input.valueType === "number" ? "number" : "text";
        typedStateVariables.push({ key: input.input.key, label: input.input.key, type, value: input.input.defaultValue, defaultValue: input.input.defaultValue });
      }
    },
    async updateGraphEntity(input: V2GraphUpdateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void> {
      bumpRevision();
      if (input.kind === "arc") {
        const index = sceneArcs.findIndex((item) => item.arcId === input.id);
        if (index !== -1) sceneArcs[index] = { ...sceneArcs[index]!, title: input.input.title, ...(input.input.summary === undefined ? {} : { summary: input.input.summary }) };
      } else if (input.kind === "scene") {
        const index = sceneScenes.findIndex((item) => item.sceneId === input.id);
        if (index !== -1) sceneScenes[index] = { ...sceneScenes[index]!, title: input.input.title, ...(input.input.body === undefined ? {} : { body: input.input.body }), ...(input.input.arcId === undefined ? {} : { arcId: input.input.arcId }), isEntry: input.input.isEntry };
      } else if (input.kind === "choice") {
        const index = sceneChoices.findIndex((item) => item.choiceId === input.id);
        if (index !== -1) sceneChoices[index] = {
          ...sceneChoices[index]!,
          sourceSceneId: input.input.sourceSceneId,
          ...(input.input.targetSceneId === undefined ? {} : { targetSceneId: input.input.targetSceneId }),
          label: input.input.label,
          gates: input.input.gates ?? [],
          consequences: input.input.consequences ?? [],
        };
      } else if (input.kind === "state") {
        const index = typedStateVariables.findIndex((item) => item.key === input.id);
        if (index !== -1) typedStateVariables[index] = { ...typedStateVariables[index]!, defaultValue: input.input.defaultValue, value: input.input.defaultValue };
      }
    },

    async prepareSceneGenerationRequest(
      request: V2GenerationContextPreviewApiRequest,
    ): Promise<V2SceneGenerationPrepareApiResponse> {
      const context = {
        storyWorldId: request.storyWorldId,
        baseCanonRevision: request.baseCanonRevision,
        requestedAt: now,
        prompt: request.prompt,
        promptPreview: request.prompt.slice(0, 160),
        tokenBudget: request.tokenBudget ?? 4096,
        contextHash: "sha256:mock-scene-preview",
        sourceFactIds: worldFacts.map((fact) => fact.factId),
        sourceCharacterIds: worldCharacters.map((character) => character.characterId),
        sourceSceneIds: sceneScenes.map((scene) => scene.sceneId),
        facts: worldFacts.map((fact) => ({ id: fact.factId, text: fact.text, visibility: fact.visibility === "creator" ? "creator_only" as const : "player_visible" as const })),
        characters: worldCharacters.map((character) => ({ characterId: character.characterId, name: character.name })),
        scenes: sceneScenes.map((scene) => ({ sceneId: scene.sceneId, title: scene.title })),
      };
      return {
        context,
        request: {
          responseFormat: "json_object",
          temperature: 0.2,
          maxTokens: context.tokenBudget,
          messages: [
            { role: "system", content: "You produce candidate JSON for a local creator-reviewed interactive fiction tool. Output only valid JSON." },
            { role: "user", content: `creatorPrompt: ${request.prompt}` },
          ],
        },
      };
    },
    async createSceneGenerationJob(
      request: V2CreateSceneGenerationJobApiRequest,
    ): Promise<V2CreateSceneGenerationJobResponse> {
      return {
        job: {
          jobId: `job_${request.storyWorldId}_${request.baseCanonRevision}` as V2JobId,
          status: "queued",
          createdAt: now,
          updatedAt: now,
        },
      };
    },
    async getSceneGenerationJob(jobId: string) {
      return {
        ...v2WebFixtureGeneration.job,
        jobId: jobId as V2JobId,
        status: "succeeded" as const,
        createdAt: now,
        updatedAt: now,
      };
    },
    async getAssetGenerationJob(jobId: string) {
      return {
        ...v2WebFixtureAssets.job,
        jobId: jobId as V2JobId,
        status: "succeeded" as const,
        createdAt: now,
        updatedAt: now,
      };
    },
    async reviewCandidate(request: V2CandidateReviewRequest): Promise<V2CandidateReviewResult> {
      const status = request.action === "request_changes" ? "changes_requested" : request.action === "approve" ? "approved" : "rejected";
      return {
        status,
        reviewedAt: now,
        reviewReason: request.reason.trim() || `${request.reviewer} marked ${request.candidateId} as ${status}.`,
      };
    },
    async createRelease() {
      return v2WebFixtureReleasePackage;
    },
    async startRun() {
      return { run: v2WebFixtureRun, player: v2WebFixturePlayer };
    },
    async submitChoice(choiceId: string) {
      const archive = choiceId === "choice_archive";
      return {
        ...v2WebFixturePlayer,
        sceneId: archive ? "scene_archive" : "scene_opening",
        title: archive ? "Archive Door" : v2WebFixturePlayer.title,
        body: archive
          ? "The archive door wakes under the ticket's ink, waiting for a reviewed state delta."
          : v2WebFixturePlayer.body,
        choiceHistory: [...v2WebFixturePlayer.choiceHistory, choiceId],
      };
    },
    async saveRun(label: string) {
      return {
        ...v2WebFixtureSave,
        label: label.trim() || v2WebFixtureSave.label,
        savedAt: now,
      };
    },
    async restoreSave() {
      return v2WebFixturePlayer;
    },
    async exportRelease(format: "json" | "markdown") {
      if (format === "markdown") {
        return {
          filename: "gate-0-demo-world-0.1.0.md",
          format,
          preview: "# Gate 0 Demo World\n\nEntry scene: Opening Scene\nRelease: 0.1.0",
        };
      }
      return v2WebFixtureExportBundle;
    },
    async uploadManualAsset(input: { readonly file: File; readonly title: string }) {
      const asset = {
        assetId: `asset:manual:${crypto.randomUUID()}`,
        title: input.title.trim() || input.file.name,
        kind: "scene_background" as const,
        mediaRef: "media://local/v2/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
        thumbnailRef: "media://local/v2/assets/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
        workflowVersion: "manual",
        seed: 0,
        approved: true,
        sourceType: "manual" as const,
        originalFilename: input.file.name,
        mimeType: input.file.type,
        byteSize: input.file.size,
      };
      assetLibrary.push(asset);
      return asset;
    },
    async prepareAssetGenerationRequest(request: V2AssetGenerationRequestInput): Promise<V2PrepareAssetGenerationApiResponse> {
      return {
        request: {
          prompt: request.prompt,
          workflowVersion: request.workflowVersion,
          workflow: request.workflow,
          ...(request.negativePrompt === undefined ? {} : { negativePrompt: request.negativePrompt }),
          ...(request.seed === undefined ? {} : { seed: request.seed }),
        },
      };
    },
    async createAssetJob(input: V2AssetGenerationRequestInput | string): Promise<V2AssetJobSummary> {
      const request = typeof input === "string"
        ? { prompt: input, workflowVersion: "local-default@1", workflow: {}, seed: 0 }
        : input;
      assetJob = {
        ...v2WebFixtureAssets.job,
        status: "queued",
        promptPreview: request.prompt.trim() || v2WebFixtureAssets.prompt,
        workflowVersion: request.workflowVersion,
        seed: request.seed ?? 0,
        terminalMessage: "Asset job queued for ComfyUI adapter.",
        updatedAt: now,
      };
      return assetJob;
    },
    async reviewAssetCandidate(request: V2AssetReviewRequest): Promise<V2AssetReviewResult> {
      const status =
        request.action === "request_changes" ? "changes_requested" : request.action === "approve" ? "approved" : "rejected";
      let approvedAsset: V2ApprovedAssetSummary | undefined;
      if (status === "approved") {
        approvedAsset = {
          assetId: assetCandidate?.candidateId ?? request.candidateId,
          title: assetCandidate?.title ?? request.candidateId,
          kind: "scene_background",
          mediaRef: assetCandidate?.mediaRef ?? "",
          thumbnailRef: assetCandidate?.thumbnailRef ?? "",
          workflowVersion: assetCandidate?.provenanceSummary ?? "unknown",
          seed: 0,
          approved: true,
          sourceType: "candidate",
        };
        if (!assetLibrary.some((asset) => asset.assetId === approvedAsset?.assetId)) {
          assetLibrary.push(approvedAsset);
        }
      }
      if (assetCandidate?.candidateId === request.candidateId) {
        assetCandidate = { ...assetCandidate, status };
      }
      return {
        status,
        reviewedAt: now,
        reviewReason: request.reason.trim() || `${request.reviewer} marked ${request.candidateId} as ${status}.`,
        ...(approvedAsset === undefined ? {} : { approvedAsset }),
      };
    },
  };
}
