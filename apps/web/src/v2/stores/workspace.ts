import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { V2IdempotencyKey, V2IsoDateTime, V2Revision, V2StoryWorldId } from "@living-network/contracts/v2";

import { createV2HttpAdapter, createV2MockAdapter, V2AdapterError } from "../adapters/index.ts";
import type {
  V2CandidateReviewAction,
  V2WorkspaceAdapter,
  V2WorkspaceMode,
  V2WorkspaceSnapshot,
} from "../adapters/types";
import { v2WebDefaultGenerationRequest } from "../fixtures/mock-data.ts";

const runtimeEnv = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};

function operationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof V2AdapterError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return fallback;
}

interface V2BrowserAdapterContext {
  readonly localStorage: Pick<Storage, "getItem">;
  readonly location: Pick<Location, "origin">;
}

const browserAdapterContext = typeof window === "undefined" ? undefined : window;

export function createV2DefaultAdapter(
  environment: Record<string, string | undefined> = runtimeEnv,
  browser: V2BrowserAdapterContext | undefined = browserAdapterContext,
): V2WorkspaceAdapter {
  const mockEnabled = environment.VITE_V2_ENABLE_MOCK === "true";
  if (mockEnabled && browser?.localStorage.getItem("living-network-v2-adapter") !== "http") {
    return createV2MockAdapter();
  }
  return createV2HttpAdapter({
    baseUrl: environment.VITE_API_BASE || (browser === undefined ? "http://127.0.0.1:3002" : browser.location.origin),
  });
}

export const useV2WorkspaceStore = defineStore("v2-workspace", () => {
  const adapter = ref<V2WorkspaceAdapter>(createV2DefaultAdapter());
  const snapshot = ref<V2WorkspaceSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const draftWorldName = ref("");
  const draftPremise = ref("");
  const expectedRevision = ref(0);
  const conflict = ref<string | null>(null);
  const generationPrompt = ref<string>(v2WebDefaultGenerationRequest.prompt);
  const generationMessage = ref<string | null>(null);
  const reviewReason = ref<string>("Looks consistent with the current mock canon.");
  const reviewer = ref<string>("local-creator");
  const reviewMessage = ref<string | null>(null);
  const saveLabel = ref<string>("Station checkpoint");
  const releaseMessage = ref<string | null>(null);
  const playerMessage = ref<string | null>(null);
  const exportFormat = ref<"json" | "markdown">("json");
  const exportMessage = ref<string | null>(null);
  const assetPrompt = ref<string>("");
  const assetReviewReason = ref<string>("Approved for the local asset library.");
  const assetMessage = ref<string | null>(null);
  const assetReviewMessage = ref<string | null>(null);

  const mode = computed(() => adapter.value.mode);
  const hasSnapshot = computed(() => snapshot.value !== null);
  const revisionLabel = computed(() =>
    snapshot.value ? `Revision ${snapshot.value.world.revision}` : "No revision",
  );
  const graphIssueCount = computed(() => snapshot.value?.sceneGraph.diagnostics.length ?? 0);
  const typedStatePreviewCount = computed(() => snapshot.value?.typedState.preview.length ?? 0);
  const candidateStatus = computed(() => snapshot.value?.candidate?.status ?? "none");
  const canReviewCandidate = computed(() => {
    const status = snapshot.value?.candidate?.status;
    return status === "pending" || status === "changes_requested";
  });
  const releaseReady = computed(() => snapshot.value?.release.valid === true);
  const currentSceneTitle = computed(() => snapshot.value?.player?.title ?? "No scene loaded");
  const assetCandidateStatus = computed(() => snapshot.value?.assets.candidate?.status ?? "none");
  const canReviewAssetCandidate = computed(() => {
    const status = snapshot.value?.assets.candidate?.status;
    return status === "pending" || status === "changes_requested";
  });
  const assetLibraryCount = computed(() => snapshot.value?.assets.library.length ?? 0);
  const hasDraftChanges = computed(
    () =>
      snapshot.value !== null &&
      (draftWorldName.value !== snapshot.value.world.name || draftPremise.value !== snapshot.value.world.premise),
  );

  function setAdapter(nextAdapter: V2WorkspaceAdapter) {
    adapter.value = nextAdapter;
    snapshot.value = null;
    error.value = null;
    conflict.value = null;
  }

  function setMode(nextMode: V2WorkspaceMode) {
    if (nextMode === "mock" && runtimeEnv.VITE_V2_ENABLE_MOCK !== "true") return;
    if (typeof window !== "undefined") window.localStorage.setItem("living-network-v2-adapter", nextMode);
    setAdapter(
      nextMode === "http"
        ? createV2HttpAdapter({ baseUrl: runtimeEnv.VITE_API_BASE || (typeof window === "undefined" ? "http://127.0.0.1:3002" : window.location.origin) })
        : createV2MockAdapter(),
    );
  }

  async function loadSnapshot() {
    loading.value = true;
    error.value = null;
    conflict.value = null;
    try {
      snapshot.value = await adapter.value.getSnapshot();
      draftWorldName.value = snapshot.value.world.name;
      draftPremise.value = snapshot.value.world.premise;
      expectedRevision.value = snapshot.value.world.revision;
      generationPrompt.value = snapshot.value.generation.job?.promptPreview ?? generationPrompt.value;
      saveLabel.value = snapshot.value.save?.label ?? saveLabel.value;
      assetPrompt.value = snapshot.value.assets.prompt;
      generationMessage.value = null;
      reviewMessage.value = null;
      releaseMessage.value = null;
      playerMessage.value = null;
      exportMessage.value = null;
      assetMessage.value = null;
      assetReviewMessage.value = null;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 adapter error");
    } finally {
      loading.value = false;
    }
  }

  async function bootstrapWorkspace() {
    loading.value = true;
    error.value = null;
    try {
      await adapter.value.bootstrapWorkspace();
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 bootstrap error");
      loading.value = false;
      return;
    }
    loading.value = false;
    await loadSnapshot();
  }

  function resetCanonDraft() {
    if (!snapshot.value) return;
    draftWorldName.value = snapshot.value.world.name;
    draftPremise.value = snapshot.value.world.premise;
    expectedRevision.value = snapshot.value.world.revision;
    conflict.value = null;
  }

  function previewCanonDraft() {
    if (!snapshot.value) return;
    if (expectedRevision.value !== snapshot.value.world.revision) {
      conflict.value = `Expected revision ${expectedRevision.value}, but workspace is at ${snapshot.value.world.revision}.`;
      return;
    }
    conflict.value = null;
    snapshot.value = {
      ...snapshot.value,
      world: {
        ...snapshot.value.world,
        name: draftWorldName.value.trim() || snapshot.value.world.name,
        premise: draftPremise.value.trim() || snapshot.value.world.premise,
        revision: snapshot.value.world.revision + 1,
      },
    };
    expectedRevision.value = snapshot.value.world.revision;
  }

  async function createGenerationJob() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    generationMessage.value = null;
    try {
      const response = await adapter.value.createSceneGenerationJob({
        storyWorldId: snapshot.value.world.storyWorldId as V2StoryWorldId,
        baseCanonRevision: snapshot.value.world.revision as V2Revision,
        prompt: generationPrompt.value,
        idempotencyKey: `idem_web_${snapshot.value.world.revision}_${generationPrompt.value.length}` as V2IdempotencyKey,
      });
      const terminalMessage =
        response.job.status === "queued"
          ? "Job queued for candidate generation."
          : snapshot.value.generation.job?.terminalMessage;
      snapshot.value = {
        ...snapshot.value,
        generation: {
          ...snapshot.value.generation,
          job: {
            ...(snapshot.value.generation.job ?? {}),
            ...response.job,
            promptPreview: generationPrompt.value,
            ...(terminalMessage ? { terminalMessage } : {}),
          },
        },
      };
      generationMessage.value = `Generation job ${response.job.jobId} is ${response.job.status}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 generation error");
    } finally {
      loading.value = false;
    }
  }

  async function reviewCandidate(action: V2CandidateReviewAction) {
    if (!snapshot.value?.candidate) return;
    loading.value = true;
    error.value = null;
    reviewMessage.value = null;
    try {
      const result = await adapter.value.reviewCandidate({
        candidateId: snapshot.value.candidate.candidateId,
        action,
        reviewer: reviewer.value,
        reason: reviewReason.value,
      });
      snapshot.value = {
        ...snapshot.value,
        candidate: {
          ...snapshot.value.candidate,
          status: result.status,
          reviewedAt: result.reviewedAt as V2IsoDateTime,
          reviewer: reviewer.value,
          reviewReason: result.reviewReason,
        },
      };
      reviewMessage.value = `Candidate marked ${result.status}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 review error");
    } finally {
      loading.value = false;
    }
  }

  async function createRelease() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    releaseMessage.value = null;
    try {
      const releasePackage = await adapter.value.createRelease();
      snapshot.value = {
        ...snapshot.value,
        releasePackage,
      };
      releaseMessage.value = `Release ${releasePackage.version} is immutable.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 release error");
    } finally {
      loading.value = false;
    }
  }

  async function submitChoice(choiceId: string) {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    playerMessage.value = null;
    try {
      const player = await adapter.value.submitChoice(choiceId);
      snapshot.value = {
        ...snapshot.value,
        player,
        run: snapshot.value.run === null ? null : { ...snapshot.value.run, currentSceneId: player.sceneId },
      };
      playerMessage.value = `Loaded scene ${player.sceneId}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 runtime error");
    } finally {
      loading.value = false;
    }
  }

  async function startRun() {
    if (!snapshot.value?.releasePackage) return;
    loading.value = true;
    error.value = null;
    playerMessage.value = null;
    try {
      const result = await adapter.value.startRun();
      snapshot.value = { ...snapshot.value, run: result.run, player: result.player };
      playerMessage.value = `Started run ${result.run.runId}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 runtime error");
    } finally {
      loading.value = false;
    }
  }

  async function saveRun() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    playerMessage.value = null;
    try {
      const save = await adapter.value.saveRun(saveLabel.value);
      snapshot.value = { ...snapshot.value, save };
      playerMessage.value = `Saved ${save.label}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 save error");
    } finally {
      loading.value = false;
    }
  }

  async function restoreSave() {
    if (!snapshot.value?.save) return;
    loading.value = true;
    error.value = null;
    playerMessage.value = null;
    try {
      const save = snapshot.value.save;
      const player = await adapter.value.restoreSave(save.saveId);
      snapshot.value = {
        ...snapshot.value,
        player,
        run: snapshot.value.run === null ? null : { ...snapshot.value.run, currentSceneId: player.sceneId },
      };
      playerMessage.value = `Restored ${save.label}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 restore error");
    } finally {
      loading.value = false;
    }
  }

  async function exportRelease() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    exportMessage.value = null;
    try {
      const exportBundle = await adapter.value.exportRelease(exportFormat.value);
      snapshot.value = { ...snapshot.value, exportBundle };
      exportMessage.value = `Prepared ${exportBundle.filename}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 export error");
    } finally {
      loading.value = false;
    }
  }

  async function createAssetJob() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    assetMessage.value = null;
    try {
      const job = await adapter.value.createAssetJob(assetPrompt.value);
      snapshot.value = {
        ...snapshot.value,
        assets: {
          ...snapshot.value.assets,
          prompt: assetPrompt.value,
          job,
        },
      };
      assetMessage.value = `Asset job ${job.jobId} is ${job.status}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 asset job error");
    } finally {
      loading.value = false;
    }
  }

  async function reviewAssetCandidate(action: V2CandidateReviewAction) {
    if (!snapshot.value?.assets.candidate) return;
    loading.value = true;
    error.value = null;
    assetReviewMessage.value = null;
    try {
      const candidate = snapshot.value.assets.candidate;
      const result = await adapter.value.reviewAssetCandidate({
        candidateId: candidate.candidateId,
        action,
        reviewer: reviewer.value,
        reason: assetReviewReason.value,
      });
      snapshot.value = {
        ...snapshot.value,
        assets: {
          ...snapshot.value.assets,
          candidate: {
            ...candidate,
            status: result.status,
            reviewedAt: result.reviewedAt as V2IsoDateTime,
            reviewer: reviewer.value,
            reviewReason: result.reviewReason,
          },
          library: result.approvedAsset
            ? [...snapshot.value.assets.library, result.approvedAsset]
            : snapshot.value.assets.library,
        },
      };
      assetReviewMessage.value = `Asset candidate marked ${result.status}.`;
    } catch (err) {
      error.value = operationErrorMessage(err, "Unknown V2 asset review error");
    } finally {
      loading.value = false;
    }
  }

  return {
    snapshot,
    loading,
    error,
    draftWorldName,
    draftPremise,
    expectedRevision,
    conflict,
    generationPrompt,
    generationMessage,
    reviewReason,
    reviewer,
    reviewMessage,
    saveLabel,
    releaseMessage,
    playerMessage,
    exportFormat,
    exportMessage,
    assetPrompt,
    assetReviewReason,
    assetMessage,
    assetReviewMessage,
    mode,
    hasSnapshot,
    revisionLabel,
    graphIssueCount,
    typedStatePreviewCount,
    candidateStatus,
    canReviewCandidate,
    releaseReady,
    currentSceneTitle,
    assetCandidateStatus,
    canReviewAssetCandidate,
    assetLibraryCount,
    hasDraftChanges,
    setAdapter,
    setMode,
    loadSnapshot,
    bootstrapWorkspace,
    resetCanonDraft,
    previewCanonDraft,
    createGenerationJob,
    reviewCandidate,
    createRelease,
    startRun,
    submitChoice,
    saveRun,
    restoreSave,
    exportRelease,
    createAssetJob,
    reviewAssetCandidate,
  };
});
