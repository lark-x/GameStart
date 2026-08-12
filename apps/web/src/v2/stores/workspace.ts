import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { V2IdempotencyKey, V2IsoDateTime, V2Revision, V2StoryWorldId } from "@living-network/contracts";

import { createV2HttpAdapter, createV2MockAdapter, V2AdapterError } from "../adapters/index.ts";
import type {
  V2CandidateReviewAction,
  V2WorkspaceAdapter,
  V2WorkspaceMode,
  V2WorkspaceSnapshot,
} from "../adapters/types";
import { v2WebDefaultGenerationRequest } from "../fixtures/mock-data.ts";

function createDefaultAdapter(): V2WorkspaceAdapter {
  if (typeof window === "undefined") return createV2MockAdapter();
  const mode = window.localStorage.getItem("living-network-v2-adapter");
  if (mode === "http") {
    return createV2HttpAdapter({
      baseUrl: import.meta.env.VITE_API_BASE || window.location.origin,
    });
  }
  return createV2MockAdapter();
}

export const useV2WorkspaceStore = defineStore("v2-workspace", () => {
  const adapter = ref<V2WorkspaceAdapter>(createDefaultAdapter());
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

  const mode = computed(() => adapter.value.mode);
  const hasSnapshot = computed(() => snapshot.value !== null);
  const revisionLabel = computed(() =>
    snapshot.value ? `Revision ${snapshot.value.world.revision}` : "No revision",
  );
  const graphIssueCount = computed(() => snapshot.value?.sceneGraph.diagnostics.length ?? 0);
  const typedStatePreviewCount = computed(() => snapshot.value?.typedState.preview.length ?? 0);
  const candidateStatus = computed(() => snapshot.value?.candidate.status ?? "pending");
  const canReviewCandidate = computed(() => snapshot.value?.candidate.status === "pending");
  const releaseReady = computed(() => snapshot.value?.release.valid === true);
  const currentSceneTitle = computed(() => snapshot.value?.player.title ?? "No scene loaded");
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
    if (typeof window !== "undefined") {
      window.localStorage.setItem("living-network-v2-adapter", nextMode);
    }
    setAdapter(
      nextMode === "http"
        ? createV2HttpAdapter({ baseUrl: import.meta.env.VITE_API_BASE || window.location.origin })
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
      generationPrompt.value = snapshot.value.generation.job.promptPreview;
      saveLabel.value = snapshot.value.save.label;
      generationMessage.value = null;
      reviewMessage.value = null;
      releaseMessage.value = null;
      playerMessage.value = null;
      exportMessage.value = null;
    } catch (err) {
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 adapter error";
      }
    } finally {
      loading.value = false;
    }
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
          : snapshot.value.generation.job.terminalMessage;
      snapshot.value = {
        ...snapshot.value,
        generation: {
          ...snapshot.value.generation,
          job: {
            ...snapshot.value.generation.job,
            ...response.job,
            promptPreview: generationPrompt.value,
            ...(terminalMessage ? { terminalMessage } : {}),
          },
        },
      };
      generationMessage.value = `Generation job ${response.job.jobId} is ${response.job.status}.`;
    } catch (err) {
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 generation error";
      }
    } finally {
      loading.value = false;
    }
  }

  async function reviewCandidate(action: V2CandidateReviewAction) {
    if (!snapshot.value) return;
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
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 review error";
      }
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
        run: {
          ...snapshot.value.run,
          releaseVersion: releasePackage.version,
        },
        save: {
          ...snapshot.value.save,
          releaseVersion: releasePackage.version,
        },
      };
      releaseMessage.value = `Release ${releasePackage.version} is immutable.`;
    } catch (err) {
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 release error";
      }
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
        run: {
          ...snapshot.value.run,
          currentSceneId: player.sceneId,
        },
        save: {
          ...snapshot.value.save,
          currentSceneId: player.sceneId,
        },
      };
      playerMessage.value = `Loaded scene ${player.sceneId}.`;
    } catch (err) {
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 runtime error";
      }
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
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 save error";
      }
    } finally {
      loading.value = false;
    }
  }

  async function restoreSave() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    playerMessage.value = null;
    try {
      const player = await adapter.value.restoreSave(snapshot.value.save.saveId);
      snapshot.value = {
        ...snapshot.value,
        player,
        run: {
          ...snapshot.value.run,
          currentSceneId: player.sceneId,
        },
      };
      playerMessage.value = `Restored ${snapshot.value.save.label}.`;
    } catch (err) {
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 restore error";
      }
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
      if (err instanceof V2AdapterError) {
        error.value = `${err.code}: ${err.message}`;
      } else if (err instanceof Error) {
        error.value = err.message;
      } else {
        error.value = "Unknown V2 export error";
      }
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
    mode,
    hasSnapshot,
    revisionLabel,
    graphIssueCount,
    typedStatePreviewCount,
    candidateStatus,
    canReviewCandidate,
    releaseReady,
    currentSceneTitle,
    hasDraftChanges,
    setAdapter,
    setMode,
    loadSnapshot,
    resetCanonDraft,
    previewCanonDraft,
    createGenerationJob,
    reviewCandidate,
    createRelease,
    submitChoice,
    saveRun,
    restoreSave,
    exportRelease,
  };
});
