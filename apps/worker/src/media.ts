import {
  ActionKind,
  attachMomentImageJob,
  compileImageWorkflow,
  completeImageJob,
  createBehaviorAction,
  createImageJob,
  createMomentDraft,
  failImageJob,
  ImageJobStatus,
  MomentDraftStatus,
  MomentVisibility,
  submitImageJob,
  retryImageJob,
  transitionMomentDraft,
  type BehaviorAction,
  type ImageJob,
  type JsonObject,
  type MomentDraft,
} from "../../../packages/domain/src/index.ts";
import { assertIsoTimestamp } from "../../../packages/domain/src/validation.ts";
import type {
  BehaviorActionRepository,
  DomainRepositories,
  EventExecutionRepository,
  ImageJobRepository,
  MomentDraftRepository,
  CharacterVisualIdentityRepository,
  ImageWorkflowTemplateRepository,
} from "../../../packages/database/src/index.ts";

export interface ComfyUiSubmitRequest {
  jobId: string;
  workflowVersion: string;
  prompt: string;
  workflow?: JsonObject;
  negativePrompt?: string;
  seed?: number;
}

export interface ComfyUiSubmitResult {
  externalJobId: string;
}

export interface ComfyUiResult {
  externalJobId: string;
  mediaRef: string;
}

export interface ComfyUiClient {
  submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult>;
  getResult(externalJobId: string): Promise<ComfyUiResult>;
}

export interface ImageWorkflowResolver {
  resolve(job: ImageJob): Promise<JsonObject>;
}

export type RepositoryImageWorkflowResolverRepositories = {
  readonly characterVisualIdentities: CharacterVisualIdentityRepository;
  readonly imageWorkflowTemplates: ImageWorkflowTemplateRepository;
};

function splitWorkflowVersion(value: string): { id: string; version: string } {
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1) {
    throw new ComfyUiError(
      "CONFIGURATION",
      "ImageJob workflowVersion must use templateId@version",
    );
  }
  return { id: value.slice(0, separator), version: value.slice(separator + 1) };
}

export class RepositoryImageWorkflowResolver implements ImageWorkflowResolver {
  private readonly repositories: RepositoryImageWorkflowResolverRepositories;

  public constructor(repositories: RepositoryImageWorkflowResolverRepositories) {
    this.repositories = repositories;
  }

  public async resolve(job: ImageJob): Promise<JsonObject> {
    const reference = splitWorkflowVersion(job.workflowVersion);
    const template = await this.repositories.imageWorkflowTemplates.getById(
      reference.id,
      reference.version,
    );
    if (!template) {
      throw new ComfyUiError(
        "CONFIGURATION",
        `Image workflow template not found: ${job.workflowVersion}`,
      );
    }
    const identity = await this.repositories.characterVisualIdentities.getByCharacterId(
      job.ownerCharacterId,
    );
    if (!identity) {
      throw new ComfyUiError(
        "CONFIGURATION",
        `Character visual identity not found: ${job.ownerCharacterId}`,
      );
    }
    const compiled = compileImageWorkflow(template, identity, {
      prompt: job.prompt,
      ...(job.negativePrompt === undefined ? {} : { negativePrompt: job.negativePrompt }),
      ...(job.seed === undefined ? {} : { seed: job.seed }),
    });
    return compiled.workflow;
  }
}

export function createRepositoryImageWorkflowResolver(
  repositories: DomainRepositories,
): RepositoryImageWorkflowResolver {
  if (!repositories.characterVisualIdentities || !repositories.imageWorkflowTemplates) {
    throw new TypeError("Visual identity/workflow repositories are not configured");
  }
  return new RepositoryImageWorkflowResolver({
    characterVisualIdentities: repositories.characterVisualIdentities,
    imageWorkflowTemplates: repositories.imageWorkflowTemplates,
  });
}

export type ComfyUiFetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ComfyUiErrorCode =
  | "CONFIGURATION"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "NOT_READY";

export class ComfyUiError extends Error {
  public readonly code: ComfyUiErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;

  public constructor(
    code: ComfyUiErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number } = {},
  ) {
    super(message);
    this.name = "ComfyUiError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.status !== undefined) this.status = options.status;
  }
}

export interface ComfyUiHttpConfig {
  baseUrl: string;
  timeoutMs?: number;
  clientId?: string;
}

function parseComfyUiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) throw new ComfyUiError("CONFIGURATION", "ComfyUI baseUrl is required");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ComfyUiError("CONFIGURATION", "ComfyUI baseUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ComfyUiError("CONFIGURATION", "ComfyUI baseUrl must use http or https");
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstHistoryImage(value: unknown, externalJobId: string): {
  filename: string;
  subfolder: string;
  type: string;
} {
  if (!isRecord(value)) throw new ComfyUiError("INVALID_RESPONSE", "ComfyUI history must be an object");
  const history = value[externalJobId];
  if (!isRecord(history)) throw new ComfyUiError("NOT_READY", "ComfyUI job has no history yet", { retryable: true });
  const outputs = history.outputs;
  if (!isRecord(outputs)) throw new ComfyUiError("NOT_READY", "ComfyUI job has no outputs yet", { retryable: true });
  for (const output of Object.values(outputs)) {
    if (!isRecord(output) || !Array.isArray(output.images)) continue;
    for (const image of output.images) {
      if (!isRecord(image) || typeof image.filename !== "string") continue;
      return {
        filename: image.filename,
        subfolder: typeof image.subfolder === "string" ? image.subfolder : "",
        type: typeof image.type === "string" ? image.type : "output",
      };
    }
  }
  throw new ComfyUiError("NOT_READY", "ComfyUI job has no image output yet", { retryable: true });
}

export class ComfyUiHttpClient implements ComfyUiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly clientId: string;
  private readonly fetchImpl: ComfyUiFetchImplementation;

  public constructor(
    config: ComfyUiHttpConfig,
    fetchImpl: ComfyUiFetchImplementation = globalThis.fetch,
  ) {
    this.baseUrl = parseComfyUiBaseUrl(config.baseUrl);
    this.timeoutMs = config.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI timeoutMs must be a positive integer");
    }
    this.clientId = config.clientId?.trim() || "living-network-worker";
    this.fetchImpl = fetchImpl;
  }

  public async submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult> {
    if (request.workflow === undefined) {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI workflow is required for HTTP submission");
    }
    const payload: Record<string, unknown> = {
      prompt: request.workflow,
      client_id: this.clientId,
      extra_data: {
        living_network_job_id: request.jobId,
        workflow_version: request.workflowVersion,
        prompt: request.prompt,
        ...(request.negativePrompt === undefined ? {} : { negative_prompt: request.negativePrompt }),
        ...(request.seed === undefined ? {} : { seed: request.seed }),
      },
    };
    const response = await this.request("/prompt", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ComfyUiError("INVALID_RESPONSE", "ComfyUI submit response is not valid JSON");
    }
    if (!isRecord(value) || typeof value.prompt_id !== "string" || value.prompt_id.trim().length === 0) {
      throw new ComfyUiError("INVALID_RESPONSE", "ComfyUI submit response has no prompt_id");
    }
    return { externalJobId: value.prompt_id };
  }

  public async getResult(externalJobId: string): Promise<ComfyUiResult> {
    if (externalJobId.trim().length === 0) {
      throw new ComfyUiError("CONFIGURATION", "ComfyUI externalJobId is required");
    }
    const response = await this.request(`/history/${encodeURIComponent(externalJobId)}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ComfyUiError("INVALID_RESPONSE", "ComfyUI history response is not valid JSON");
    }
    const image = firstHistoryImage(value, externalJobId);
    const query = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder,
      type: image.type,
    });
    return {
      externalJobId,
      mediaRef: `${this.baseUrl}/view?${query.toString()}`,
    };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ComfyUiError("TIMEOUT", "ComfyUI request timed out", { retryable: true });
      }
      throw new ComfyUiError(
        "NETWORK_ERROR",
        error instanceof Error ? "ComfyUI request failed" : "ComfyUI request failed",
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      let detail = "ComfyUI returned an error";
      try {
        const text = await response.text();
        if (text.trim().length > 0) detail = text.slice(0, 2048);
      } catch {
        // Preserve bounded generic error when the body cannot be read.
      }
      throw new ComfyUiError("HTTP_ERROR", detail, {
        status: response.status,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
    }
    return response;
  }
}

export class FakeComfyUiClient implements ComfyUiClient {
  private readonly submissions = new Map<string, ComfyUiSubmitRequest>();

  public async submit(request: ComfyUiSubmitRequest): Promise<ComfyUiSubmitResult> {
    const existing = this.submissions.get(request.jobId);
    if (existing) return { externalJobId: `fake-comfy:${request.jobId}` };
    this.submissions.set(request.jobId, { ...request });
    return { externalJobId: `fake-comfy:${request.jobId}` };
  }

  public async getResult(externalJobId: string): Promise<ComfyUiResult> {
    const prefix = "fake-comfy:";
    if (!externalJobId.startsWith(prefix)) {
      throw new Error("Fake ComfyUI does not recognize externalJobId");
    }
    const jobId = externalJobId.slice(prefix.length);
    if (!this.submissions.has(jobId)) throw new Error(`Fake ComfyUI job not found: ${jobId}`);
    return {
      externalJobId,
      mediaRef: `media://fake-comfy/${jobId}.png`,
    };
  }
}

export type BehaviorMediaCoordinatorRepositories = DomainRepositories & {
  readonly eventExecutions: EventExecutionRepository;
  readonly behaviorActions: BehaviorActionRepository;
  readonly momentDrafts: MomentDraftRepository;
  readonly imageJobs: ImageJobRepository;
};

export interface PlanBehaviorActionInput {
  id: string;
  executionId: string;
  actorCharacterId: string;
  kind: ActionKind;
  payload: JsonObject;
  priority?: number;
  momentVisibility?: MomentVisibility;
}

export type BehaviorMediaCoordinatorClock = () => Date;

function requireRepositories(repositories: DomainRepositories): BehaviorMediaCoordinatorRepositories {
  if (
    !repositories.eventExecutions ||
    !repositories.behaviorActions ||
    !repositories.momentDrafts ||
    !repositories.imageJobs
  ) {
    throw new TypeError("Behavior/media repositories are not configured");
  }
  return repositories as BehaviorMediaCoordinatorRepositories;
}

function nowIso(clock: BehaviorMediaCoordinatorClock): string {
  const value = clock().toISOString();
  assertIsoTimestamp(value, "behaviorMedia.clock");
  return value;
}

function imageRequested(action: BehaviorAction): boolean {
  return action.kind === ActionKind.REQUEST_IMAGE ||
    (action.kind === ActionKind.CREATE_MOMENT && action.payload.imagePrompt !== undefined);
}

export class BehaviorMediaCoordinator {
  private readonly repositories: BehaviorMediaCoordinatorRepositories;
  private readonly comfyUi: ComfyUiClient;
  private readonly clock: BehaviorMediaCoordinatorClock;
  private readonly workflowResolver: ImageWorkflowResolver | undefined;

  public constructor(
    repositories: DomainRepositories,
    comfyUi: ComfyUiClient,
    clock: BehaviorMediaCoordinatorClock = () => new Date(),
    workflowResolver?: ImageWorkflowResolver,
  ) {
    this.repositories = requireRepositories(repositories);
    this.comfyUi = comfyUi;
    this.clock = clock;
    this.workflowResolver = workflowResolver;
  }

  public async planAction(input: PlanBehaviorActionInput): Promise<BehaviorAction> {
    const existing = await this.repositories.behaviorActions.getById(input.id);
    if (existing) return existing;
    const execution = await this.repositories.eventExecutions.getById(input.executionId);
    if (!execution) throw new TypeError(`Unknown event execution: ${input.executionId}`);
    const createdAt = nowIso(this.clock);
    const actionInput = {
      id: input.id,
      execution,
      actorCharacterId: input.actorCharacterId,
      kind: input.kind,
      payload: input.payload,
      createdAt,
    };
    const action = createBehaviorAction(
      input.priority === undefined ? actionInput : { ...actionInput, priority: input.priority },
    );
    await this.repositories.behaviorActions.save(action);

    let draft: MomentDraft | undefined;
    if (action.kind === ActionKind.CREATE_MOMENT) {
      draft = await this.repositories.momentDrafts.getByActionId(action.id);
      if (!draft) {
        draft = createMomentDraft({
          id: `moment:${action.id}`,
          action,
          visibility: input.momentVisibility ?? MomentVisibility.PUBLIC,
          createdAt,
        });
        await this.repositories.momentDrafts.save(draft);
      }
    }

    if (imageRequested(action)) {
      let job = await this.repositories.imageJobs.getByActionId(action.id);
      if (!job) {
        const imageInput = {
          id: `image:${action.id}`,
          action,
          createdAt,
        };
        job = createImageJob(
          draft === undefined ? imageInput : { ...imageInput, momentDraftId: draft.id },
        );
        await this.repositories.imageJobs.save(job);
        if (draft && draft.imageJobId === undefined) {
          draft = attachMomentImageJob(draft, job.id, createdAt);
          await this.repositories.momentDrafts.save(draft);
        }
      }
    }
    return action;
  }

  public async submitImageJob(jobId: string): Promise<ImageJob> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    if (job.status !== ImageJobStatus.QUEUED) return job;
    const workflow = this.workflowResolver === undefined
      ? undefined
      : await this.workflowResolver.resolve(job);
    const result = await this.comfyUi.submit({
      jobId: job.id,
      workflowVersion: job.workflowVersion,
      prompt: job.prompt,
      ...(workflow === undefined ? {} : { workflow }),
      ...(job.negativePrompt === undefined ? {} : { negativePrompt: job.negativePrompt }),
      ...(job.seed === undefined ? {} : { seed: job.seed }),
    });
    const submitted = submitImageJob(job, result.externalJobId, nowIso(this.clock));
    await this.repositories.imageJobs.save(submitted);
    return submitted;
  }

  public async completeImageJob(jobId: string): Promise<ImageJob> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    if (job.status === ImageJobStatus.SUCCEEDED) return job;
    if (job.status !== ImageJobStatus.SUBMITTED || job.externalJobId === undefined) {
      throw new Error(`image job ${job.id} is not submitted`);
    }
    const result = await this.comfyUi.getResult(job.externalJobId);
    const completed = completeImageJob(job, result.mediaRef, nowIso(this.clock));
    await this.repositories.imageJobs.save(completed);
    if (job.momentDraftId !== undefined) {
      const draft = await this.repositories.momentDrafts.getById(job.momentDraftId);
      if (draft && draft.status === MomentDraftStatus.DRAFT) {
        await this.repositories.momentDrafts.save(
          transitionMomentDraft(draft, MomentDraftStatus.READY, completed.updatedAt),
        );
      }
    }
    return completed;
  }

  /** Polls a ComfyUI result with bounded retry for NOT_READY/retryable failures. */
  public async completeImageJobWithRetry(
    jobId: string,
    options: { maxAttempts?: number; delayMs?: number } = {},
  ): Promise<ImageJob> {
    const maxAttempts = options.maxAttempts ?? 5;
    const delayMs = options.delayMs ?? 1000;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new RangeError("image completion maxAttempts must be between 1 and 20");
    }
    if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 60_000) {
      throw new RangeError("image completion delayMs must be between 0 and 60000");
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.completeImageJob(jobId);
      } catch (error) {
        lastError = error;
        const retryable = error instanceof ComfyUiError ? error.retryable : false;
        if (!retryable || attempt === maxAttempts - 1) throw error;
        if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError instanceof Error ? lastError : new Error("image completion failed");
  }

  public async failImageJob(jobId: string, reason: string): Promise<ImageJob> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    const failed = failImageJob(job, reason, nowIso(this.clock));
    await this.repositories.imageJobs.save(failed);
    if (job.momentDraftId !== undefined) {
      const draft = await this.repositories.momentDrafts.getById(job.momentDraftId);
      if (draft && draft.status === MomentDraftStatus.DRAFT) {
        await this.repositories.momentDrafts.save(
          transitionMomentDraft(draft, MomentDraftStatus.REJECTED, failed.updatedAt),
        );
      }
    }
    return failed;
  }

  public async retryImageJob(jobId: string, maxAttempts = 3): Promise<ImageJob> {
    const job = await this.repositories.imageJobs.getById(jobId);
    if (!job) throw new TypeError(`Unknown image job: ${jobId}`);
    const retry = retryImageJob(job, nowIso(this.clock), maxAttempts);
    await this.repositories.imageJobs.save(retry);
    if (job.momentDraftId !== undefined) {
      const draft = await this.repositories.momentDrafts.getById(job.momentDraftId);
      if (draft && draft.status === MomentDraftStatus.REJECTED) {
        await this.repositories.momentDrafts.save({
          ...draft,
          status: MomentDraftStatus.DRAFT,
          updatedAt: retry.updatedAt,
        });
      }
    }
    return retry;
  }
}

export function createBehaviorMediaCoordinator(
  repositories: DomainRepositories,
  comfyUi: ComfyUiClient,
  clock?: BehaviorMediaCoordinatorClock,
  workflowResolver?: ImageWorkflowResolver,
): BehaviorMediaCoordinator {
  return new BehaviorMediaCoordinator(repositories, comfyUi, clock, workflowResolver);
}
