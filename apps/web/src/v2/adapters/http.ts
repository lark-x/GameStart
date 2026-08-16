import type {
  V2CanonSnapshotDto,
  V2CandidateReviewResponse,
  V2CoreExportBundleDto,
  V2CreateAssetGenerationJobApiResponse,
  V2CreateSceneGenerationJobRequest,
  V2CreateSceneGenerationJobResponse,
  V2ErrorEnvelope,
  V2GraphSnapshotDto,
  V2GraphValidationDto,
  V2HealthResponse,
  V2ReleaseManifestDto,
  V2ReleasePreflightDto,
  V2ReviewAssetCandidateApiResponse,
  V2RuntimeSaveDto,
  V2RuntimeSceneDto,
  V2StateSnapshotDto,
  V2StateVariableDto,
  V2StoryWorldDto,
} from "@living-network/contracts/v2";

import type { V2AssetCandidateListApiResponse, V2ApprovedAssetListApiResponse } from "@living-network/contracts/v2";
import type { V2AssetGenerationJobApiResponse, V2AssetGenerationJobListApiResponse } from "@living-network/contracts/v2";
import type { V2GenerationJobApiResponse, V2GenerationJobListApiResponse } from "@living-network/contracts/v2";
import {
  V2AdapterError,
  type V2ApprovedAssetSummary,
  type V2AssetJobSummary,
  type V2AssetReviewRequest,
  type V2AssetReviewResult,
  type V2CandidateReviewRequest,
  type V2CandidateReviewResult,
  type V2ExportBundleSummary,
  type V2PlayerRuntimeSummary,
  type V2ReleasePackageSummary,
  type V2RunSummary,
  type V2SaveSummary,
  type V2GraphCreateInput,
  type V2CanonUpdateInput,
  type V2GraphUpdateInput,
  type V2CanonCreateInput,
  type V2WorkspaceAdapter,
  type V2WorkspaceSnapshot,
} from "./types.ts";

export interface V2HttpAdapterOptions {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | V2ErrorEnvelope | { readonly error?: { readonly message?: string } };
  if (!response.ok) {
    const error = typeof payload === "object" && payload !== null && "error" in payload ? payload.error : undefined;
    const typedError = typeof error === "object" && error !== null ? error : {};
    throw new V2AdapterError({
      code: typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code as V2ErrorEnvelope["error"]["code"]
        : "INTERNAL_ERROR",
      message: typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : `Request failed with HTTP ${response.status}`,
      ...("field" in typedError && typeof typedError.field === "string" ? { field: typedError.field } : {}),
      ...("correlationId" in typedError && typeof typedError.correlationId === "string" ? { correlationId: typedError.correlationId } : {}),
    });
  }
  return payload as T;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function uniqueCommandKey(prefix: string): string {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

function toPlayer(runtime: V2RuntimeSceneDto): V2PlayerRuntimeSummary {
  return {
    sceneId: runtime.scene.sceneId,
    title: runtime.scene.title,
    body: runtime.scene.body ?? "",
    choices: runtime.availableChoices.map((choice) => ({
      choiceId: choice.choiceId,
      label: choice.label,
      targetSceneId: choice.targetSceneId ?? runtime.scene.sceneId,
      disabled: false,
    })),
    choiceHistory: runtime.run.choiceHistory,
  };
}

function toRun(runtime: V2RuntimeSceneDto): V2RunSummary {
  return {
    runId: runtime.run.runId,
    releaseVersion: runtime.run.releaseVersion,
    currentSceneId: runtime.run.currentSceneId,
  };
}

function toSceneJobSummary(job: V2GenerationJobListApiResponse["jobs"][number]) {
  return {
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    promptPreview: job.prompt,
    ...(job.failureReason === undefined ? {} : { terminalMessage: job.failureReason }),
  };
}

function toAssetJobSummary(job: V2AssetGenerationJobListApiResponse["jobs"][number]): V2AssetJobSummary {
  return {
    jobId: job.jobId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    workflowVersion: job.workflowVersion,
    seed: job.seed ?? 0,
    promptPreview: job.prompt,
    ...(job.failureReason === undefined ? {} : { terminalMessage: job.failureReason }),
  };
}

export function v2MediaRefToUrl(mediaRef: string, baseUrl: string): string | undefined {
  const match = /^media:\/\/local\/v2\/assets\/([a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif))$/i.exec(mediaRef);
  return match?.[1] === undefined ? undefined : `${baseUrl.replace(/\/$/, "")}/api/v2/media/assets/${match[1]}`;
}

export function createV2HttpAdapter(options: V2HttpAdapterOptions): V2WorkspaceAdapter {
  const fetcher = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  let worldId: string | undefined;
  let revision: number | undefined;
  let releaseId: string | undefined;
  let releaseVersion: string | undefined;
  let runId: string | undefined;
  let saveId: string | undefined;
  let saveLabel = "Local checkpoint";

  const get = async <T>(path: string) => parseJson<T>(await fetcher(`${baseUrl}${path}`, jsonRequest("GET")));
  const post = async <T>(path: string, body: unknown) => parseJson<T>(await fetcher(`${baseUrl}${path}`, jsonRequest("POST", body)));

  const patch = async <T>(path: string, body: unknown) => parseJson<T>(await fetcher(`${baseUrl}${path}`, jsonRequest("PATCH", body)));
  return {
    mode: "http",
    async bootstrapWorkspace(): Promise<void> {
      const suffix = crypto.randomUUID();
      worldId = `world:${suffix}`;
      await post("/api/v2/core/worlds", {
        storyWorldId: worldId,
        name: "My V2 Story World",
        summary: "A local creator-owned interactive story workspace.",
        idempotencyKey: `bootstrap:${suffix}`,
      });
      revision = 1;
      await post(`/api/v2/core/worlds/${encodeURIComponent(worldId)}/scenes`, {
        sceneId: "scene:opening",
        title: "Opening Scene",
        body: "The first playable scene in this local story world.",
        isEntry: true,
        expectedRevision: revision,
        idempotencyKey: `bootstrap-scene:${suffix}`,
      });
      revision = 2;
    },
    async listStoryWorlds(): Promise<readonly V2StoryWorldDto[]> {
      return get<readonly V2StoryWorldDto[]>("/api/v2/core/worlds");
    },
    async updateStoryWorld(input): Promise<V2StoryWorldDto> {
      const response = await patch<{ readonly item: V2StoryWorldDto }>(`/api/v2/core/worlds/${encodeURIComponent(input.storyWorldId)}`, {
        name: input.name,
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        expectedRevision: input.expectedRevision,
        idempotencyKey: uniqueCommandKey("update-world"),
      });
      worldId = response.item.storyWorldId;
      revision = response.item.revision;
      return response.item;
    },

    async createStoryWorld(input: { readonly name: string; readonly summary?: string }): Promise<V2StoryWorldDto> {
      const suffix = crypto.randomUUID();
      const created = await post<{ item: V2StoryWorldDto }>("/api/v2/core/worlds", {
        storyWorldId: `world:${suffix}`,
        name: input.name,
        ...(input.summary !== undefined && input.summary.trim() !== "" ? { summary: input.summary.trim() } : {}),
        idempotencyKey: `create-world:${suffix}`,
      });
      // 新世界成为当前工作区，下一次 getSnapshot 优先加载它
      worldId = created.item.storyWorldId;
      revision = created.item.revision;
      return created.item;
    },
    async getSnapshot(storyWorldId?: string): Promise<V2WorkspaceSnapshot> {
      if (storyWorldId !== undefined) worldId = storyWorldId;
      const [health, worlds] = await Promise.all([
        get<V2HealthResponse>("/api/v2/health"),
        get<readonly V2StoryWorldDto[]>("/api/v2/core/worlds"),
      ]);
      const world = worlds.find((candidate) => candidate.storyWorldId === worldId) ?? worlds[0];
      if (!world) {
        throw new V2AdapterError({ code: "NOT_FOUND", message: "No V2 story world exists. Create one through the Core API first." });
      }
      worldId = world.storyWorldId;
      revision = world.revision;
      const encodedWorld = encodeURIComponent(worldId);
      const [canon, graph, validation, variables, initial, candidates, preflight, releases, sceneJobs, assetJobs, assetCandidates, assetLibrary] = await Promise.all([
        get<V2CanonSnapshotDto>(`/api/v2/core/worlds/${encodedWorld}/canon`),
        get<V2GraphSnapshotDto>(`/api/v2/core/worlds/${encodedWorld}/graph`),
        get<V2GraphValidationDto>(`/api/v2/core/worlds/${encodedWorld}/graph/validation`),
        get<readonly V2StateVariableDto[]>(`/api/v2/core/worlds/${encodedWorld}/state/variables`),
        get<V2StateSnapshotDto>(`/api/v2/core/worlds/${encodedWorld}/state/initial`),
        get<readonly NonNullable<V2WorkspaceSnapshot["candidate"]>[]>(
          `/api/v2/core/worlds/${encodedWorld}/candidates/scenes`,
        ),
        get<V2ReleasePreflightDto>(`/api/v2/core/worlds/${encodedWorld}/releases/preflight`),
        get<readonly V2ReleaseManifestDto[]>(`/api/v2/core/worlds/${encodedWorld}/releases`),
        get<V2GenerationJobListApiResponse>(`/api/v2/generation/worlds/${encodedWorld}/jobs`),
        get<V2AssetGenerationJobListApiResponse>(`/api/v2/generation/assets/worlds/${encodedWorld}/jobs`),
        get<V2AssetCandidateListApiResponse>(`/api/v2/generation/assets/worlds/${encodedWorld}/candidates`),
        get<V2ApprovedAssetListApiResponse>(`/api/v2/generation/assets/worlds/${encodedWorld}/library`),
      ]);
      const candidate = candidates.find((item) => item.status === "pending" || item.status === "changes_requested") ?? candidates.at(-1) ?? null;
      const release = releases.at(-1) ?? null;
      const sceneJob = sceneJobs.jobs[0] ?? null;
      const assetJob = assetJobs.jobs[0] ?? null;
      if (release) {
        releaseId = release.releaseId;
        releaseVersion = release.version;
      }
      let runtime: V2RuntimeSceneDto | null = null;
      if (runId) runtime = await get<V2RuntimeSceneDto>(`/api/v2/core/runtime/runs/${encodeURIComponent(runId)}/scene`);
      let save: V2RuntimeSaveDto | null = null;
      if (saveId) save = await get<V2RuntimeSaveDto>(`/api/v2/core/runtime/saves/${encodeURIComponent(saveId)}`);
      const entryScene = graph.scenes.find((scene) => scene.isEntry);
      const selectedAssetCandidate = assetCandidates.candidates.find((item) => item.status === "pending" || item.status === "changes_requested") ?? assetCandidates.candidates.at(-1);
      const assetCandidateSummary = selectedAssetCandidate === undefined ? null : {
        candidateId: selectedAssetCandidate.candidateId,
        status: selectedAssetCandidate.status,
        title: selectedAssetCandidate.payload.asset.prompt,
        mediaRef: selectedAssetCandidate.payload.asset.mediaRef,
        thumbnailRef: selectedAssetCandidate.payload.asset.mediaRef,
        sourceJobId: selectedAssetCandidate.payload.asset.sourceJobId,
        provenanceSummary: selectedAssetCandidate.payload.asset.workflowVersion,
        validationNotes: selectedAssetCandidate.payload.validationNotes,
        ...(selectedAssetCandidate.reviewedAt === undefined ? {} : { reviewedAt: selectedAssetCandidate.reviewedAt }),
        ...(selectedAssetCandidate.reviewer === undefined ? {} : { reviewer: selectedAssetCandidate.reviewer }),
        ...(selectedAssetCandidate.reviewReason === undefined ? {} : { reviewReason: selectedAssetCandidate.reviewReason }),
      };
      const approvedAssetSummaries = assetLibrary.assets.map((asset) => ({
        assetId: asset.assetId,
        title: asset.assetId,
        kind: "scene_background" as const,
        mediaRef: asset.mediaRef,
        thumbnailRef: asset.mediaRef,
        workflowVersion: "unknown",
        seed: 0,
        approved: true,
      }));
      return {
        health,
        world: {
          storyWorldId: world.storyWorldId,
          name: world.name,
          revision: world.revision,
          premise: world.summary ?? "",
          characters: canon.characters.map((character) => ({ characterId: character.characterId, name: character.name, role: character.summary ?? "character" })),
          locations: canon.locations.map((location) => ({ locationId: location.locationId, name: location.name, tags: [] })),
          facts: canon.facts.map((fact) => ({ factId: fact.factId, text: fact.text, visibility: fact.visibility === "creator_only" ? "creator" : "player" })),
          rules: canon.rules.map((rule) => ({ ruleId: rule.ruleId, text: rule.text, severity: rule.severity === "required" ? "hard" : "soft" })),
          timelineEvents: canon.timelineEvents.map((event) => ({
            timelineEventId: event.timelineEventId,
            localDate: event.localDate,
            title: event.title,
            ...(event.summary === undefined ? {} : { summary: event.summary }),
          })),
        },
        sceneGraph: {
          entrySceneId: entryScene?.sceneId ?? "",
          arcs: graph.arcs.map((arc) => ({ arcId: arc.arcId, title: arc.title, ...(arc.summary === undefined ? {} : { summary: arc.summary }) })),
          scenes: graph.scenes.map((scene) => ({
            sceneId: scene.sceneId,
            ...(scene.arcId === undefined ? {} : { arcId: scene.arcId }),
            ...(scene.body === undefined ? {} : { body: scene.body }),
            title: scene.title,
            isEntry: scene.isEntry,
            choiceCount: graph.choices.filter((choice) => choice.sourceSceneId === scene.sceneId).length,
            reachable: !validation.diagnostics.some((diagnostic) => diagnostic.code === "UNREACHABLE_SCENE" && diagnostic.sceneId === scene.sceneId),
            stateDeltaPreview: [],
          })),
          choices: graph.choices.map((choice) => ({
            choiceId: choice.choiceId,
            sourceSceneId: choice.sourceSceneId,
            ...(choice.targetSceneId === undefined ? {} : { targetSceneId: choice.targetSceneId }),
            label: choice.label,
            gates: (choice.gates ?? []).map((gate) => ({ stateKey: gate.stateKey, operator: gate.operator, value: gate.value })),
            consequences: (choice.consequences ?? []).map((consequence) => ({ stateKey: consequence.stateKey, operation: consequence.operation, value: consequence.value })),
          })),
          diagnostics: validation.diagnostics.map((diagnostic) => ({
            code: diagnostic.code,
            severity: diagnostic.severity === "error" ? "danger" : "warning",
            message: diagnostic.message,
            ...(diagnostic.sceneId === undefined ? {} : { targetId: diagnostic.sceneId }),
          })),
        },
        typedState: {
          schemaRevision: world.revision,
          variables: variables.map((variable) => ({
            key: variable.key,
            label: variable.key,
            type: variable.valueType === "boolean" ? "flag" : variable.valueType === "string" ? "text" : "number",
            value: initial.values[variable.key] ?? variable.defaultValue,
            defaultValue: variable.defaultValue,
          })),
          preview: [],
        },
        generation: {
          context: {
            baseCanonRevision: sceneJob?.baseCanonRevision ?? world.revision,
            contextHash: sceneJob?.contextHash ?? candidate?.provenance.contextHash ?? "not-generated",
            tokenBudget: sceneJob?.context.tokenBudget ?? 4096,
            sources: [
              { id: world.storyWorldId, label: world.name, kind: "world" },
              ...canon.characters.map((character) => ({ id: character.characterId, label: character.name, kind: "character" as const })),
              ...canon.locations.map((location) => ({ id: location.locationId, label: location.name, kind: "location" as const })),
              ...canon.facts.map((fact) => ({ id: fact.factId, label: fact.text, kind: "fact" as const })),
            ],
          },
          job: sceneJob === null ? null : toSceneJobSummary(sceneJob),
          diff: {
            title: candidate?.payload.scene.title ?? "No generated candidate",
            scope: candidate ? ["scene", `${candidate.payload.choices.length} choices`] : [],
            additions: candidate ? [candidate.payload.scene.body] : [],
            warnings: candidate?.payload.validationNotes ?? [],
          },
        },
        candidate,
        release: {
          storyWorldId: world.storyWorldId,
          revision: world.revision,
          valid: preflight.valid,
          issues: preflight.diagnostics.map((diagnostic) => diagnostic.message),
        },
        releasePackage: release === null ? null : {
          releaseId: release.releaseId,
          version: release.version,
          manifestHash: release.contentHash,
          immutable: true,
          createdAt: release.createdAt,
          exportFormats: ["json", "markdown"],
        },
        run: runtime === null ? null : toRun(runtime),
        player: runtime === null ? null : toPlayer(runtime),
        save: save === null ? null : {
          saveId: save.saveId,
          label: saveLabel,
          runId: save.runId,
          releaseVersion: save.releaseVersion,
          currentSceneId: save.currentSceneId,
          savedAt: save.createdAt,
        },
        exportBundle: null,
        assets: {
          workflowName: "local-comfyui",
          prompt: assetJob?.prompt ?? "",
          job: assetJob === null ? null : toAssetJobSummary(assetJob),
          candidate: assetCandidateSummary,
          library: approvedAssetSummaries,
        },
      };
    },
    async createGraphEntity(input: V2GraphCreateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void> {
      const suffix = crypto.randomUUID();
      const path = `/api/v2/core/worlds/${encodeURIComponent(input.storyWorldId)}`;
      const common = { expectedRevision: input.expectedRevision, idempotencyKey: uniqueCommandKey(`create-${input.kind}`) };
      if (input.kind === "arc") await post(`${path}/arcs`, { ...input.input, arcId: `arc:${suffix}`, ...common });
      if (input.kind === "scene") await post(`${path}/scenes`, { ...input.input, sceneId: `scene:${suffix}`, ...common });
      if (input.kind === "choice") await post(`${path}/choices`, { ...input.input, choiceId: `choice:${suffix}`, ...common });
      if (input.kind === "state") await post(`${path}/state/variables`, { ...input.input, ...common });
    },
    async getAssetGenerationJob(jobId: string) {
      return toAssetJobSummary((await get<V2AssetGenerationJobApiResponse>(`/api/v2/generation/assets/jobs/${encodeURIComponent(jobId)}`)).job);
    },
    async createCanonEntity(input: V2CanonCreateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void> {
      const suffix = crypto.randomUUID();
      const path = `/api/v2/core/worlds/${encodeURIComponent(input.storyWorldId)}`;
      const common = { expectedRevision: input.expectedRevision, idempotencyKey: uniqueCommandKey(`create-${input.kind}`) };
      if (input.kind === "location") await post(`${path}/locations`, { ...input.input, locationId: `location:${suffix}`, ...common });
      if (input.kind === "character") await post(`${path}/characters`, { ...input.input, characterId: `character:${suffix}`, ...common });
      if (input.kind === "fact") await post(`${path}/facts`, { ...input.input, factId: `fact:${suffix}`, ...common });
      if (input.kind === "rule") await post(`${path}/rules`, { ...input.input, ruleId: `rule:${suffix}`, ...common });
      if (input.kind === "timeline") await post(`${path}/timeline-events`, { ...input.input, timelineEventId: `timeline:${suffix}`, ...common });
    },
    async updateCanonEntity(input: V2CanonUpdateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void> {
      const path = `/api/v2/core/worlds/${encodeURIComponent(input.storyWorldId)}`;
      const body = { ...input.input, expectedRevision: input.expectedRevision, idempotencyKey: uniqueCommandKey(`update-${input.kind}`) };
      if (input.kind === "location") await patch(`${path}/locations/${encodeURIComponent(input.id)}`, body);
      if (input.kind === "character") await patch(`${path}/characters/${encodeURIComponent(input.id)}`, body);
      if (input.kind === "fact") await patch(`${path}/facts/${encodeURIComponent(input.id)}`, body);
      if (input.kind === "rule") await patch(`${path}/rules/${encodeURIComponent(input.id)}`, body);
      if (input.kind === "timeline") await patch(`${path}/timeline-events/${encodeURIComponent(input.id)}`, body);
    },
    async updateGraphEntity(input: V2GraphUpdateInput & { readonly storyWorldId: string; readonly expectedRevision: number }): Promise<void> {
      const path = `/api/v2/core/worlds/${encodeURIComponent(input.storyWorldId)}`;
      const body = { ...input.input, expectedRevision: input.expectedRevision, idempotencyKey: uniqueCommandKey(`update-${input.kind}`) };
      if (input.kind === "arc") await patch(`${path}/arcs/${encodeURIComponent(input.id)}`, body);
      if (input.kind === "scene") await patch(`${path}/scenes/${encodeURIComponent(input.id)}`, body);
      if (input.kind === "choice") await patch(`${path}/choices/${encodeURIComponent(input.id)}`, body);
      if (input.kind === "state") await patch(`${path}/state/variables/${encodeURIComponent(input.id)}`, body);
    },
    async createSceneGenerationJob(request: V2CreateSceneGenerationJobRequest): Promise<V2CreateSceneGenerationJobResponse> {
      const response = await post<{ readonly job: V2CreateSceneGenerationJobResponse["job"] }>(
        "/api/v2/generation/jobs/scene",
        request,
      );
      return { job: response.job };
    },
    async getSceneGenerationJob(jobId: string) {
      return toSceneJobSummary((await get<V2GenerationJobApiResponse>(`/api/v2/generation/jobs/${encodeURIComponent(jobId)}`)).job);
    },
    async reviewCandidate(request: V2CandidateReviewRequest): Promise<V2CandidateReviewResult> {
      if (!worldId || revision === undefined) throw new V2AdapterError({ code: "NOT_FOUND", message: "Load a workspace before reviewing a candidate." });
      const response = await post<V2CandidateReviewResponse>(
        `/api/v2/core/worlds/${encodeURIComponent(worldId)}/candidates/scenes/${encodeURIComponent(request.candidateId)}/review`,
        {
          action: request.action,
          reviewer: request.reviewer,
          reason: request.reason,
          expectedRevision: revision,
          idempotencyKey: uniqueCommandKey("review"),
        },
      );
      revision = response.revision;
      return {
        status: response.candidate.status,
        reviewedAt: response.candidate.reviewedAt ?? new Date().toISOString(),
        reviewReason: response.candidate.reviewReason ?? request.reason,
      };
    },
    async createRelease(): Promise<V2ReleasePackageSummary> {
      if (!worldId || revision === undefined) throw new V2AdapterError({ code: "NOT_FOUND", message: "Load a workspace before creating a release." });
      const created = await post<V2ReleaseManifestDto>(`/api/v2/core/worlds/${encodeURIComponent(worldId)}/releases`, {
        releaseId: `release:${worldId}:${revision}`,
        version: `0.0.${revision}`,
        sourceRevision: revision,
        idempotencyKey: `release:${worldId}:${revision}`,
      });
      releaseId = created.releaseId;
      releaseVersion = created.version;
      return {
        releaseId: created.releaseId,
        version: created.version,
        manifestHash: created.contentHash,
        immutable: true,
        createdAt: created.createdAt,
        exportFormats: ["json", "markdown"],
      };
    },
    async startRun() {
      if (!releaseId || !releaseVersion) throw new V2AdapterError({ code: "NOT_FOUND", message: "Create or load a release before starting a run." });
      runId = `run:${Date.now()}:${crypto.randomUUID()}`;
      const runtime = await post<V2RuntimeSceneDto>("/api/v2/core/runtime/runs", {
        runId,
        releaseId,
        idempotencyKey: runId,
      });
      return { run: toRun(runtime), player: toPlayer(runtime) };
    },
    async submitChoice(choiceId: string): Promise<V2PlayerRuntimeSummary> {
      if (!runId) throw new V2AdapterError({ code: "NOT_FOUND", message: "Start a run before submitting a choice." });
      const runtime = await post<V2RuntimeSceneDto>(`/api/v2/core/runtime/runs/${encodeURIComponent(runId)}/choices`, {
        choiceId,
        idempotencyKey: uniqueCommandKey("choice"),
      });
      return toPlayer(runtime);
    },
    async saveRun(label: string): Promise<V2SaveSummary> {
      if (!runId) throw new V2AdapterError({ code: "NOT_FOUND", message: "Start a run before saving." });
      saveId = `save:${Date.now()}:${crypto.randomUUID()}`;
      saveLabel = label.trim() || "Local checkpoint";
      const save = await post<V2RuntimeSaveDto>(`/api/v2/core/runtime/runs/${encodeURIComponent(runId)}/saves`, {
        saveId,
        idempotencyKey: saveId,
      });
      return { saveId: save.saveId, label: saveLabel, runId: save.runId, releaseVersion: save.releaseVersion, currentSceneId: save.currentSceneId, savedAt: save.createdAt };
    },
    async restoreSave(savedId: string): Promise<V2PlayerRuntimeSummary> {
      runId = `run:restored:${Date.now()}:${crypto.randomUUID()}`;
      const runtime = await post<V2RuntimeSceneDto>(`/api/v2/core/runtime/saves/${encodeURIComponent(savedId)}/load`, {
        runId,
        idempotencyKey: runId,
      });
      return toPlayer(runtime);
    },
    async exportRelease(format: "json" | "markdown"): Promise<V2ExportBundleSummary> {
      if (!releaseId || !releaseVersion) throw new V2AdapterError({ code: "NOT_FOUND", message: "Create or load a release before exporting." });
      const bundle = await get<V2CoreExportBundleDto>(`/api/v2/core/releases/${encodeURIComponent(releaseId)}/export`);
      return {
        filename: `${releaseId}.${format === "json" ? "json" : "md"}`,
        format,
        preview: format === "json" ? JSON.stringify(bundle.json, null, 2) : bundle.markdown,
      };
    },
    async createAssetJob(prompt: string): Promise<V2AssetJobSummary> {
      if (!worldId) throw new V2AdapterError({ code: "NOT_FOUND", message: "Load a workspace before creating an asset job." });
      const response = await post<V2CreateAssetGenerationJobApiResponse>("/api/v2/generation/assets/jobs", {
        storyWorldId: worldId,
        idempotencyKey: uniqueCommandKey("asset-job"),
        prompt,
        workflowVersion: "local-default@1",
        workflow: {},
        seed: 0,
      });
      return {
        jobId: response.job.jobId,
        status: response.job.status,
        createdAt: response.job.createdAt,
        updatedAt: response.job.updatedAt,
        workflowVersion: response.job.workflowVersion,
        seed: response.job.seed ?? 0,
        promptPreview: response.job.prompt,
        ...(response.job.failureReason === undefined ? {} : { terminalMessage: response.job.failureReason }),
      };
    },
    async reviewAssetCandidate(request: V2AssetReviewRequest): Promise<V2AssetReviewResult> {
      const response = await post<V2ReviewAssetCandidateApiResponse>(
        `/api/v2/generation/assets/candidates/${encodeURIComponent(request.candidateId)}/review`,
        { action: request.action, reviewer: request.reviewer, reason: request.reason, idempotencyKey: uniqueCommandKey("asset-review") },
      );
      const approvedAsset: V2ApprovedAssetSummary | undefined = response.approvedAsset === undefined ? undefined : {
        assetId: response.approvedAsset.assetId,
        title: response.approvedAsset.assetId,
        kind: "scene_background",
        mediaRef: response.approvedAsset.mediaRef,
        thumbnailRef: response.approvedAsset.mediaRef,
        workflowVersion: "approved",
        seed: 0,
        approved: true,
      };
      return {
        status: response.candidate.status,
        reviewedAt: response.review.reviewedAt,
        reviewReason: response.review.reason ?? request.reason,
        ...(approvedAsset === undefined ? {} : { approvedAsset }),
      };
    },
  };
}
