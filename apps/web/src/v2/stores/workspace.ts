import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { V2IdempotencyKey, V2IsoDateTime, V2Revision, V2StoryWorldId } from "@living-network/contracts/v2";
import type { V2StoryWorldDto } from "@living-network/contracts/v2";

import { useNotificationStore } from "./notification.ts";
import { createV2HttpAdapter, createV2MockAdapter, V2AdapterError } from "../adapters/index.ts";
import type {
  V2CandidateReviewAction,
  V2WorkspaceAdapter,
  V2GraphCreateInput,
  V2CanonUpdateInput,
  V2GraphUpdateInput,
  V2CanonCreateInput,
  V2WorkspaceMode,
  V2WorkspaceSnapshot,
} from "../adapters/types.ts";
import { v2WebDefaultGenerationRequest } from "../fixtures/mock-data.ts";

const runtimeEnv = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};

const statusLabels: Readonly<Record<string, string>> = {
  queued: "排队中",
  claimed: "已领取",
  running: "执行中",
  succeeded: "已完成",
  pending: "待审核",
  approved: "已通过",
  changes_requested: "要求修改",
  rejected: "已驳回",
  failed: "失败",
  cancelled: "已取消",
};

function statusLabel(status: string): string {
  return statusLabels[status] ?? status;
}

function reviewActionLabel(status: string): string {
  return {
    approved: "通过",
    changes_requested: "要求修改",
    rejected: "驳回",
  }[status] ?? statusLabel(status);
}

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
  const storyWorlds = ref<readonly V2StoryWorldDto[]>([]);
  const activeStoryWorldId = ref<string | null>(typeof window === "undefined" ? null : window.localStorage.getItem("living-network-v2-story-world"));

  const loading = ref(false);
  const creatingStory = ref(false);
  const error = ref<string | null>(null);
  const draftWorldName = ref("");
  const draftPremise = ref("");
  const expectedRevision = ref(0);
  const conflict = ref<string | null>(null);
  const generationPrompt = ref<string>(v2WebDefaultGenerationRequest.prompt);
  const generationMessage = ref<string | null>(null);
  const reviewReason = ref<string>("与当前故事设定一致，可以通过审核。");
  const reviewer = ref<string>("本地创作者");
  const reviewMessage = ref<string | null>(null);
  const saveLabel = ref<string>("车站检查点");
  const releaseMessage = ref<string | null>(null);
  const playerMessage = ref<string | null>(null);
  const exportFormat = ref<"json" | "markdown">("json");
  const exportMessage = ref<string | null>(null);
  const assetPrompt = ref<string>("");
  const assetReviewReason = ref<string>("通过后加入本地素材库。");
  const assetMessage = ref<string | null>(null);
  const assetReviewMessage = ref<string | null>(null);
  let assetPollTimer: ReturnType<typeof setTimeout> | undefined;
  let assetPollStartedAt = 0;
  let generationPollTimer: ReturnType<typeof setTimeout> | undefined;
  let generationPollStartedAt = 0;


  const mode = computed(() => adapter.value.mode);
  const hasSnapshot = computed(() => snapshot.value !== null);
  const revisionLabel = computed(() =>
    snapshot.value ? `版本 ${snapshot.value.world.revision}` : "暂无版本",
  );
  const graphIssueCount = computed(() => snapshot.value?.sceneGraph.diagnostics.length ?? 0);
  const typedStatePreviewCount = computed(() => snapshot.value?.typedState.preview.length ?? 0);
  const candidateStatus = computed(() => snapshot.value?.candidate?.status ?? "none");
  const canReviewCandidate = computed(() => {
    const status = snapshot.value?.candidate?.status;
    return status === "pending" || status === "changes_requested";
  });
  const releaseReady = computed(() => snapshot.value?.release.valid === true);
  const currentSceneTitle = computed(() => snapshot.value?.player?.title ?? "尚未加载场景");
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

  function stopGenerationPolling(): void {
    if (generationPollTimer !== undefined) clearTimeout(generationPollTimer);
    generationPollTimer = undefined;
  }

  function startGenerationPolling(jobId: string): void {
    stopGenerationPolling();
    generationPollStartedAt = Date.now();
    const poll = async (): Promise<void> => {
      if (!snapshot.value?.generation.job || snapshot.value.generation.job.jobId !== jobId) return;
      if (Date.now() - generationPollStartedAt > 5 * 60 * 1000) {
        generationMessage.value = "生成任务轮询已暂停，可手动刷新状态继续查看。";
        stopGenerationPolling();
        return;
      }
      try {
        const job = await adapter.value.getSceneGenerationJob(jobId);
        if (!snapshot.value?.generation.job || snapshot.value.generation.job.jobId !== jobId) return;
        snapshot.value = { ...snapshot.value, generation: { ...snapshot.value.generation, job: { ...snapshot.value.generation.job, ...job } } };
        if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
          stopGenerationPolling();
          await loadSnapshot();
          return;
        }
        generationPollTimer = setTimeout(() => void poll(), 2000);
      } catch (err) {
        stopGenerationPolling();
        error.value = operationErrorMessage(err, "读取生成任务状态失败");
      }
    };
    generationPollTimer = setTimeout(() => void poll(), 2000);
  }

  function stopAssetPolling(): void {
    if (assetPollTimer !== undefined) clearTimeout(assetPollTimer);
    assetPollTimer = undefined;
  }

  function startAssetPolling(jobId: string): void {
    stopAssetPolling();
    assetPollStartedAt = Date.now();
    const poll = async (): Promise<void> => {
      if (!snapshot.value?.assets.job || snapshot.value.assets.job.jobId !== jobId) return;
      if (Date.now() - assetPollStartedAt > 5 * 60 * 1000) {
        assetMessage.value = "素材任务轮询已暂停，可手动刷新状态。";
        stopAssetPolling();
        return;
      }
      try {
        const job = await adapter.value.getAssetGenerationJob(jobId);
        if (!snapshot.value?.assets.job || snapshot.value.assets.job.jobId !== jobId) return;
        snapshot.value = { ...snapshot.value, assets: { ...snapshot.value.assets, job: { ...snapshot.value.assets.job, ...job } } };
        if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
          stopAssetPolling();
          await loadSnapshot();
          return;
        }
        assetPollTimer = setTimeout(() => void poll(), 2000);
      } catch (err) {
        stopAssetPolling();
        error.value = operationErrorMessage(err, "读取素材任务状态失败");
      }
    };
    assetPollTimer = setTimeout(() => void poll(), 2000);
  }

  function setAdapter(nextAdapter: V2WorkspaceAdapter) {
    stopAssetPolling();
    stopGenerationPolling();
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
      storyWorlds.value = await adapter.value.listStoryWorlds();
      if (storyWorlds.value.length === 0) {
        snapshot.value = null;
        return;
      }
      const selected = storyWorlds.value.find((world) => world.storyWorldId === activeStoryWorldId.value) ?? storyWorlds.value[0]!;
      snapshot.value = await adapter.value.getSnapshot(selected.storyWorldId);
      activeStoryWorldId.value = snapshot.value.world.storyWorldId;
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
      const sceneJob = snapshot.value.generation.job;
      if (adapter.value.mode === "http" && sceneJob !== null && (sceneJob.status === "queued" || sceneJob.status === "claimed" || sceneJob.status === "running")) {
        startGenerationPolling(sceneJob.jobId);
      } else {
        stopGenerationPolling();
      }
      const assetJob = snapshot.value.assets.job;
      if (adapter.value.mode === "http" && assetJob !== null && (assetJob.status === "queued" || assetJob.status === "claimed" || assetJob.status === "running")) {
        startAssetPolling(assetJob.jobId);
      } else {
        stopAssetPolling();
      }
    } catch (err) {
      error.value = operationErrorMessage(err, "无法读取 V2 工作区状态");
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
      error.value = operationErrorMessage(err, "无法创建初始故事空间");
      loading.value = false;
      return;
    }
    loading.value = false;
    await loadSnapshot();
  }

  /** 新建故事世界并切换到该世界；失败时抛出错误，由调用方展示。 */
  async function createStoryWorld(input: { readonly name: string; readonly summary?: string }): Promise<void> {
    creatingStory.value = true;
    error.value = null;
    try {
      const created = await adapter.value.createStoryWorld(input);
      activeStoryWorldId.value = created.storyWorldId;
      await loadSnapshot();
    } catch (err) {
      error.value = operationErrorMessage(err, "无法创建故事世界");
      throw err;
    } finally {
      creatingStory.value = false;
    }
  }

  async function selectStoryWorld(storyWorldId: string): Promise<void> {
    stopGenerationPolling();
    stopAssetPolling();
    if (activeStoryWorldId.value === storyWorldId) return;
    activeStoryWorldId.value = storyWorldId;
    await loadSnapshot();
  }
  function resetCanonDraft() {
    if (!snapshot.value) return;
    draftWorldName.value = snapshot.value.world.name;
    draftPremise.value = snapshot.value.world.premise;
    expectedRevision.value = snapshot.value.world.revision;
    conflict.value = null;
  }

  async function previewCanonDraft(): Promise<void> {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    conflict.value = null;
    try {
      const saved = await adapter.value.updateStoryWorld({ storyWorldId: snapshot.value.world.storyWorldId, name: draftWorldName.value.trim() || snapshot.value.world.name, ...(draftPremise.value.trim() === "" ? {} : { summary: draftPremise.value.trim() }), expectedRevision: expectedRevision.value });
      expectedRevision.value = saved.revision;
      await loadSnapshot();
    } catch (err) {
      if (err instanceof V2AdapterError && err.code === "STALE_REVISION") {
        const current = await adapter.value.getSnapshot(snapshot.value.world.storyWorldId);
        snapshot.value = current;
        expectedRevision.value = current.world.revision;
        conflict.value = `服务端已有新版本（${err.message}）。草稿已保留，请确认后再次保存。`;
        return;
      }
      error.value = operationErrorMessage(err, "保存故事设定失败");
    } finally {
      loading.value = false;
    }
  }
  async function createCanonEntity(input: V2CanonCreateInput): Promise<void> {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    try {
      await adapter.value.createCanonEntity({ ...input, storyWorldId: snapshot.value.world.storyWorldId, expectedRevision: snapshot.value.world.revision });
      await loadSnapshot();
    } catch (err) {
      error.value = operationErrorMessage(err, "创建正典数据失败");
    } finally {
      loading.value = false;
    }
  }
  async function createGraphEntity(input: V2GraphCreateInput): Promise<void> {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    try {
      await adapter.value.createGraphEntity({ ...input, storyWorldId: snapshot.value.world.storyWorldId, expectedRevision: snapshot.value.world.revision });
      await loadSnapshot();
    } catch (err) {
      error.value = operationErrorMessage(err, "创建图谱数据失败");
    } finally {
      loading.value = false;
    }
  }



  async function updateCanonEntity(input: V2CanonUpdateInput): Promise<void> {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    try {
      await adapter.value.updateCanonEntity({ ...input, storyWorldId: snapshot.value.world.storyWorldId, expectedRevision: snapshot.value.world.revision });
      await loadSnapshot();
    } catch (err) {
      error.value = operationErrorMessage(err, "保存正典数据失败");
    } finally {
      loading.value = false;
    }
  }

  async function updateGraphEntity(input: V2GraphUpdateInput): Promise<void> {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    try {
      await adapter.value.updateGraphEntity({ ...input, storyWorldId: snapshot.value.world.storyWorldId, expectedRevision: snapshot.value.world.revision });
      await loadSnapshot();
    } catch (err) {
      error.value = operationErrorMessage(err, "保存图谱数据失败");
    } finally {
      loading.value = false;
    }
  }
  async function createGenerationJob() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    generationMessage.value = null;
    const toast = useNotificationStore();
    try {
      const response = await adapter.value.createSceneGenerationJob({
        storyWorldId: snapshot.value.world.storyWorldId as V2StoryWorldId,
        baseCanonRevision: snapshot.value.world.revision as V2Revision,
        prompt: generationPrompt.value,
        idempotencyKey: `generation:${crypto.randomUUID()}` as V2IdempotencyKey,
      });
      const terminalMessage =
        response.job.status === "queued"
          ? "生成任务已排队，等待候选内容生成。"
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
      startGenerationPolling(response.job.jobId);
      generationMessage.value = `生成任务已创建，当前状态：${statusLabel(response.job.status)}。`;
    } catch (err) {
      const msg = operationErrorMessage(err, "创建生成任务失败");
      error.value = msg;
      toast.error(msg);
    } finally {
      loading.value = false;
    }
  }

  async function reviewCandidate(action: V2CandidateReviewAction) {
    if (!snapshot.value?.candidate) return;
    loading.value = true;
    error.value = null;
    reviewMessage.value = null;
    const toast = useNotificationStore();
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
      if (adapter.value.mode === "http") await loadSnapshot();
      reviewMessage.value = `候选内容已${reviewActionLabel(result.status)}。`;
    } catch (err) {
      const msg = operationErrorMessage(err, "审核候选内容失败");
      error.value = msg;
      toast.error(msg);
    } finally {
      loading.value = false;
    }
  }

  async function createRelease() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    releaseMessage.value = null;
    const toast = useNotificationStore();
    try {
      const releasePackage = await adapter.value.createRelease();
      snapshot.value = {
        ...snapshot.value,
        releasePackage,
      };
      releaseMessage.value = `发布版本 ${releasePackage.version} 已锁定。`;
    } catch (err) {
      const msg = operationErrorMessage(err, "创建发布版本失败");
      error.value = msg;
      toast.error(msg);
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
      playerMessage.value = "场景已切换。";
    } catch (err) {
      error.value = operationErrorMessage(err, "运行场景失败");
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
      playerMessage.value = "已启动运行预览。";
    } catch (err) {
      error.value = operationErrorMessage(err, "启动运行预览失败");
    } finally {
      loading.value = false;
    }
  }

  async function saveRun() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    playerMessage.value = null;
    const toast = useNotificationStore();
    try {
      const save = await adapter.value.saveRun(saveLabel.value);
      snapshot.value = { ...snapshot.value, save };
      playerMessage.value = `已保存“${save.label}”。`;
    } catch (err) {
      const msg = operationErrorMessage(err, "保存运行失败");
      error.value = msg;
      toast.error(msg);
    } finally {
      loading.value = false;
    }
  }

  async function restoreSave() {
    if (!snapshot.value?.save) return;
    loading.value = true;
    error.value = null;
    playerMessage.value = null;
    const toast = useNotificationStore();
    try {
      const save = snapshot.value.save;
      const player = await adapter.value.restoreSave(save.saveId);
      snapshot.value = {
        ...snapshot.value,
        player,
        run: snapshot.value.run === null ? null : { ...snapshot.value.run, currentSceneId: player.sceneId },
      };
      playerMessage.value = `已恢复“${save.label}”。`;
    } catch (err) {
      const msg = operationErrorMessage(err, "恢复存档失败");
      error.value = msg;
      toast.error(msg);
    } finally {
      loading.value = false;
    }
  }

  async function exportRelease() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    exportMessage.value = null;
    const toast = useNotificationStore();
    try {
      const exportBundle = await adapter.value.exportRelease(exportFormat.value);
      snapshot.value = { ...snapshot.value, exportBundle };
      exportMessage.value = `已准备导出文件：${exportBundle.filename}。`;
    } catch (err) {
      const msg = operationErrorMessage(err, "导出发布版本失败");
      error.value = msg;
      toast.error(msg);
    } finally {
      loading.value = false;
    }
  }

  async function createAssetJob() {
    if (!snapshot.value) return;
    loading.value = true;
    error.value = null;
    assetMessage.value = null;
    const toast = useNotificationStore();
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
      startAssetPolling(job.jobId);
      assetMessage.value = `素材任务已创建，当前状态：${statusLabel(job.status)}。`;
    } catch (err) {
      const msg = operationErrorMessage(err, "创建素材任务失败");
      error.value = msg;
      toast.error(msg);
    } finally {
      loading.value = false;
    }
  }

  async function reviewAssetCandidate(action: V2CandidateReviewAction) {
    if (!snapshot.value?.assets.candidate) return;
    loading.value = true;
    error.value = null;
    assetReviewMessage.value = null;
    const toast = useNotificationStore();
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
      await loadSnapshot();
      assetReviewMessage.value = `素材候选已${reviewActionLabel(result.status)}。`;
    } catch (err) {
      const msg = operationErrorMessage(err, "审核素材候选失败");
      error.value = msg;
      toast.error(msg);
    } finally {
      loading.value = false;
    }
  }

  return {
    snapshot,
    loading,
    storyWorlds,
    activeStoryWorldId,
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
    createStoryWorld,
    creatingStory,
    selectStoryWorld,
    resetCanonDraft,
    previewCanonDraft,
    createGraphEntity,
    updateGraphEntity,
    createCanonEntity,
    updateCanonEntity,
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
