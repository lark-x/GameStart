import type {
  V2CandidateId,
  V2ChatMaintenanceJobDto,
  V2ConversationId,
  V2ConversationSummaryDto,
  V2ConversationSummaryPayload,
  V2IdempotencyKey,
  V2MaintenanceJobType,
  V2MemoryConsolidateCandidate,
  V2MemoryConsolidatePayload,
  V2MemoryExtractPayload,
  V2FactExtractorVersion,
  V2MemoryId,
  V2MemoryKind,
  V2MessageId,
  V2Revision,
  V2SceneId,
  V2StoryAnalyzePayload,
  V2StoryWorldId,
  V2CharacterId,
} from "@living-network/contracts/v2";
import type { V2ChatMessageRepository, V2ChatUnitOfWork } from "@living-network/ports/v2";
import type { ChatProvider } from "@living-network/ai/v2";
import {
  buildStoryAnalyzerPrompt,
  buildFactExtractionPrompt,
  parseFactExtractionOutput,
  parseStoryAnalyzerOutput,
  StructuredOutputError,
} from "@living-network/ai/prompt-engine";
import {
  createV2ConversationSummary,
  createV2FactAssertion,
  createV2FactAssertionBatch,
  createV2ChatMaintenanceJob,
  createV2Memory,
  createV2SceneCandidate,
  type V2ChatMaintenanceJob,
  type V2ChatMessage,
  type V2ConversationSummary,
  type V2Memory,
} from "@living-network/domain/v2";
import { createHash, randomUUID } from "node:crypto";

export interface V2MaintenanceDispatchPumpOptions {
  readonly workerId: string;
  readonly unitOfWork: V2ChatUnitOfWork;
  readonly provider?: ChatProvider;
  readonly memoryProvider?: ChatProvider;
  readonly storyAnalysisProvider?: ChatProvider;
  readonly pollIntervalMs?: number;
  readonly leaseDurationMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly now?: () => Date;
}

export interface V2ConsolidationDecision {
  readonly action: "keep_both" | "ignore" | "merge" | "supersede";
  readonly rationale: string;
  readonly mergedContent?: string;
}

export class SourceMessageNotFoundError extends Error {
  public readonly code = "SOURCE_MESSAGE_NOT_FOUND";

  public constructor(message: string) {
    super(message);
    this.name = "SourceMessageNotFoundError";
  }
}

export class LeaseLostError extends Error {
  public readonly code = "LEASE_LOST";

  public constructor(message: string) {
    super(message);
    this.name = "LeaseLostError";
  }
}

type V2FactAssertionSubjectEntityType = "user" | "character" | "location" | "item" | "faction" | "concept";

export class V2MaintenanceDispatchPump {
  private readonly workerId: string;
  private readonly unitOfWork: V2ChatUnitOfWork;
  private readonly memoryProvider: ChatProvider;
  private readonly storyAnalysisProvider: ChatProvider;
  private readonly pollIntervalMs: number;
  private readonly leaseDurationMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly now: () => Date;

  private pollTimer: NodeJS.Timeout | undefined = undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined = undefined;
  private currentJobId: string | undefined = undefined;
  private running = false;
  private isProcessing = false;

  public constructor(options: V2MaintenanceDispatchPumpOptions) {
    this.workerId = options.workerId;
    this.unitOfWork = options.unitOfWork;
    this.memoryProvider = options.memoryProvider ?? options.provider!;
    this.storyAnalysisProvider = options.storyAnalysisProvider ?? options.provider!;
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.leaseDurationMs = options.leaseDurationMs ?? 30000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10000;
    this.now = options.now ?? (() => new Date());
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNextPoll(0);
    this.startHeartbeat();
  }

  public stop(): void {
    this.running = false;
    if (this.pollTimer !== undefined) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.running) return;
    if (this.pollTimer !== undefined) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(async () => {
      if (!this.running) return;
      await this.tick();
      this.scheduleNextPoll(this.pollIntervalMs);
    }, delayMs);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (!this.running || !this.currentJobId) return;
      try {
        const jobId = this.currentJobId;
        const nowIso = this.now().toISOString();
        const leaseExpiresAt = new Date(this.now().getTime() + this.leaseDurationMs).toISOString();
        const renewed = await this.unitOfWork.withChatTransaction(async (repos) => {
          return repos.maintenanceJobs.renewLease({
            jobId,
            workerId: this.workerId,
            leaseExpiresAt,
            now: nowIso,
          });
        });
        if (!renewed) {
          console.warn(`[MaintenancePump] Failed to renew lease for job ${this.currentJobId}`);
        }
      } catch (err) {
        console.error(`[MaintenancePump] Error renewing lease:`, err);
      }
    }, this.heartbeatIntervalMs);
  }

  public async tick(): Promise<boolean> {
    if (this.isProcessing) return false;
    this.isProcessing = true;
    try {
      const nowIso = this.now().toISOString();
      const job = await this.unitOfWork.withChatTransaction(async (repos) => {
        return repos.maintenanceJobs.claimNext({
          workerId: this.workerId,
          leaseDurationMs: this.leaseDurationMs,
          now: nowIso,
        });
      });

      if (!job) {
        return false;
      }

      this.currentJobId = job.jobId;
      await this.executeJob(job);
      return true;
    } catch (error) {
      console.error(`[MaintenancePump] Error during tick:`, error);
      return false;
    } finally {
      this.currentJobId = undefined;
      this.isProcessing = false;
    }
  }

  private async executeJob(job: V2ChatMaintenanceJob): Promise<void> {
    try {
      if (job.jobType === "memory_extract") {
        await this.handleMemoryExtract(job);
      } else if (job.jobType === "memory_consolidate") {
        await this.handleMemoryConsolidate(job);
      } else if (job.jobType === "conversation_summary") {
        await this.handleConversationSummary(job);
      } else if (job.jobType === "story_analyze") {
        await this.handleStoryAnalyze(job);
      } else {
        throw new Error(`Unknown maintenance job type: ${job.jobType}`);
      }

      const completed = await this.unitOfWork.withChatTransaction(async (repos) => {
        return repos.maintenanceJobs.markCompleted({
          jobId: job.jobId,
          workerId: this.workerId,
          now: this.now().toISOString(),
        });
      });
      if (!completed) {
        console.warn(`[MaintenancePump] LEASE_LOST: cannot mark job ${job.jobId} completed (lost lease)`);
      }
    } catch (error: any) {
      console.error(`[MaintenancePump] Job ${job.jobId} failed:`, error);
      const isTerminal = job.attempts >= job.maxAttempts;
      const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 60000);
      const retryAvailableAt = new Date(this.now().getTime() + backoffMs).toISOString();
      const errorCode = (error as { code?: string } | undefined)?.code;
      const errorMessage = error?.message ?? String(error);
      const lastError = errorCode === undefined ? errorMessage : `${errorCode}: ${errorMessage}`;

      const failed = await this.unitOfWork.withChatTransaction(async (repos) => {
        return repos.maintenanceJobs.markFailed({
          jobId: job.jobId,
          workerId: this.workerId,
          error: lastError,
          isTerminal,
          ...(isTerminal ? {} : { retryAvailableAt }),
          now: this.now().toISOString(),
        });
      });
      if (!failed) {
        console.warn(`[MaintenancePump] LEASE_LOST: cannot mark job ${job.jobId} failed (lost lease)`);
      }
    }
  }

  private async handleMemoryExtract(job: V2ChatMaintenanceJob): Promise<void> {
    const payload = job.payload as unknown as V2MemoryExtractPayload;
    if (!payload || !payload.sourceMessageIds || payload.sourceMessageIds.length === 0) {
      throw new SourceMessageNotFoundError("Memory extract job payload has no sourceMessageIds");
    }

    const sortedMessages = await this.unitOfWork.withChatTransaction(async (repos) => {
      return this.resolveSourceMessages(repos.messages, payload.conversationId, payload.sourceMessageIds);
    });

    const extractorVersion = "fact.extract:v1" as V2FactExtractorVersion;
    const fromMessageId = (payload.range?.fromMessageId ?? sortedMessages[0]?.messageId) as V2MessageId | undefined;
    const toMessageId = (payload.range?.toMessageId ?? sortedMessages[sortedMessages.length - 1]?.messageId) as V2MessageId | undefined;
    if (fromMessageId === undefined || toMessageId === undefined) {
      throw new SourceMessageNotFoundError("Memory extract job has no message range");
    }
    const sourceHash = createHash("sha256")
      .update(JSON.stringify([...payload.sourceMessageIds].sort()))
      .digest("hex");

    // 1. Resolve the immutable fact batch for this exact source range + extractor version.
    const existingBatch = await this.unitOfWork.withChatTransaction(async (repos) =>
      repos.facts.findBatchByRange({
        conversationId: payload.conversationId,
        fromMessageId,
        toMessageId,
        extractorVersion,
      }));

    let batchId: string;
    if (existingBatch !== undefined) {
      batchId = existingBatch.batchId;
    } else {
      // 2. Run the unified fact extractor (single LLM call; engines never re-extract).
      const { system, user } = buildFactExtractionPrompt({
        extractorVersion,
        messages: sortedMessages.map((message) => ({
          role: message.role,
          messageId: message.messageId,
          ...(message.text === undefined ? {} : { text: message.text }),
        })),
      });
      const completion = await this.memoryProvider.complete({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
      });
      const parsed = parseFactExtractionOutput((completion as { reply?: string }).reply ?? completion.content ?? "");
      const validSourceSet = new Set<string>(payload.sourceMessageIds);
      for (const fact of parsed) {
        const invalidCitations = fact.sourceMessageIds.filter((id) => !validSourceSet.has(id));
        if (invalidCitations.length > 0) {
          throw new StructuredOutputError(
            "INVALID_SCHEMA",
            `Fact assertion cites source message ids outside the job range: ${invalidCitations.join(", ")}`,
          );
        }
      }

      // 3. Persist the fact batch + assertions (fact ledger commit is the recovery boundary).
      const nowIso = this.now().toISOString();
      const conversation = await this.unitOfWork.withChatTransaction(async (repos) => repos.conversations.get(payload.conversationId));
      const storyWorldId = (payload.storyWorldId ?? conversation?.storyWorldId ?? "default_world") as V2StoryWorldId;
      batchId = `fact_batch:${randomUUID()}`;
      const batch = createV2FactAssertionBatch({
        batchId,
        storyWorldId,
        conversationId: payload.conversationId,
        fromMessageId,
        toMessageId,
        sourceMessageIds: payload.sourceMessageIds,
        sourceHash,
        extractorVersion,
        status: "completed",
        createdAt: nowIso,
        completedAt: nowIso,
      });
      const assertions = parsed.map((fact, index) => createV2FactAssertion({
        assertionId: `fact:${batchId}:${index}`,
        batchId,
        storyWorldId,
        conversationId: payload.conversationId,
        scopeType: this.scopeTypeForSubject(fact.subject.entityType),
        scopeId: fact.subject.entityType === "user" || fact.subject.entityType === "character"
          ? fact.subject.entityId
          : storyWorldId,
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        kind: fact.kind,
        text: fact.text,
        changeHint: fact.changeHint,
        ...(fact.epistemicStatus === undefined ? {} : { epistemicStatus: fact.epistemicStatus }),
        confidence: fact.confidence,
        importanceHint: fact.importanceHint,
        sourceMessageIds: fact.sourceMessageIds,
        observedAt: nowIso,
        extractorVersion,
      }));
      await this.unitOfWork.withChatTransaction(async (repos) => {
        await this.assertLeaseOwner(job.jobId, repos);
        await repos.facts.createBatch(batch);
        await repos.facts.createAssertions(assertions);
      });

      // 4. Legacy bridge: feed the same assertions into the existing memory pipeline.
      const candidates = assertions.map((assertion) => ({
        kind: assertion.kind as V2MemoryKind,
        content: assertion.text,
        importance: assertion.importanceHint,
        confidence: assertion.confidence,
        sourceMessageIds: assertion.sourceMessageIds as V2MessageId[],
      }));
      await this.applyMemoryCandidates(job, payload, candidates);
    }

    const cursorMessageId = payload.range?.toMessageId ?? sortedMessages[sortedMessages.length - 1]?.messageId;
    if (cursorMessageId !== undefined) {
      await this.unitOfWork.withChatTransaction(async (repos) => {
        await this.assertLeaseOwner(job.jobId, repos);
        await repos.maintenanceJobs.setMemoryExtractCursor(payload.conversationId, cursorMessageId as V2MessageId);
      });
    }
  }

  private async applyMemoryCandidates(
    job: V2ChatMaintenanceJob,
    payload: V2MemoryExtractPayload,
    candidates: readonly {
      readonly kind: V2MemoryKind;
      readonly content: string;
      readonly importance: number;
      readonly confidence: number;
      readonly sourceMessageIds: readonly V2MessageId[];
    }[],
  ): Promise<void> {
    const validSourceSet = new Set(payload.sourceMessageIds);
    for (const candidate of candidates) {
      const invalidCitations = candidate.sourceMessageIds.filter((id) => !validSourceSet.has(id));
      if (invalidCitations.length > 0) {
        throw new StructuredOutputError(
          "INVALID_SCHEMA",
          `Memory candidate cites source message ids outside the job range: ${invalidCitations.join(", ")}`,
        );
      }
      const citedIds = candidate.sourceMessageIds;

      await this.unitOfWork.withChatTransaction(async (repos) => {
        await this.assertLeaseOwner(job.jobId, repos);
        const conversation = await repos.conversations.get(payload.conversationId);
        const storyWorldId = (payload.storyWorldId ?? conversation?.storyWorldId ?? "default_world") as V2StoryWorldId;
        const existingMemories = await repos.memories.listByConversation(payload.conversationId);
        const exactMatch = existingMemories.find(
          (m: V2Memory) => m.status === "active" && m.kind === candidate.kind && m.content.trim() === candidate.content.trim(),
        );
        if (exactMatch) {
          return;
        }

        const similarCandidates = await repos.memories.searchActive({
          storyWorldId,
          query: candidate.content,
          limit: 5,
        });
        const similarMemory = similarCandidates.find(
          (m: V2Memory) => m.status === "active" && m.kind === candidate.kind,
        );

        if (similarMemory) {
          const idempotencyKey = `memory_consolidate:${similarMemory.memoryId}:${candidate.content.trim()}`;
          const alreadyQueued = await repos.maintenanceJobs.findJobByDedupeKey("memory_consolidate", idempotencyKey) !== undefined;
          if (alreadyQueued) {
            return;
          }
          const consolidatePayload: V2MemoryConsolidatePayload = {
            conversationId: payload.conversationId,
            ...(payload.storyWorldId ? { storyWorldId: payload.storyWorldId } : {}),
            ...(payload.characterId ? { characterId: payload.characterId } : {}),
            existingMemoryId: similarMemory.memoryId as V2MemoryId,
            idempotencyKey,
            candidate: {
              kind: candidate.kind,
              content: candidate.content,
              importance: candidate.importance,
              confidence: candidate.confidence,
              sourceMessageIds: citedIds,
            },
          };

          const newJob = createV2ChatMaintenanceJob({
            jobId: randomUUID(),
            conversationId: payload.conversationId,
            jobType: "memory_consolidate",
            payload: consolidatePayload,
            status: "pending",
            dedupeKey: idempotencyKey,
            now: this.now().toISOString(),
          } as any);

          await repos.maintenanceJobs.enqueue(newJob);
        } else {
          const newMemory = createV2Memory({
            memoryId: randomUUID(),
            storyWorldId,
            conversationId: payload.conversationId,
            ...(payload.characterId ? { characterId: payload.characterId } : {}),
            kind: candidate.kind,
            content: candidate.content,
            importance: candidate.importance,
            confidence: candidate.confidence,
            sourceMessageIds: citedIds,
            status: "active",
            createdAt: this.now().toISOString(),
            updatedAt: this.now().toISOString(),
          });
          await repos.memories.create(newMemory);
        }
      });
    }
  }

  private scopeTypeForSubject(entityType: V2FactAssertionSubjectEntityType): "user" | "world" | "character" | "conversation" {
    if (entityType === "user") return "user";
    if (entityType === "character") return "character";
    return "world";
  }

  private async handleMemoryConsolidate(job: V2ChatMaintenanceJob): Promise<void> {
    const payload = job.payload as unknown as V2MemoryConsolidatePayload;
    if (!payload || !payload.existingMemoryId || !payload.candidate) {
      return;
    }

    const existingMemory = await this.unitOfWork.withChatTransaction(async (repos) => {
      return repos.memories.get(payload.existingMemoryId);
    });
    if (!existingMemory || existingMemory.status !== "active") {
      return;
    }

    const prompt = `Compare this existing memory with a new memory candidate:
Existing Memory: [${existingMemory.kind}] "${existingMemory.content}"
New Candidate: [${payload.candidate.kind}] "${payload.candidate.content}"

Decide the best consolidation action:
- "keep_both": Both contain distinct non-conflicting facts.
- "ignore": The new candidate is redundant or adds no value.
- "merge": Combine them into a single comprehensive fact.
- "supersede": The new candidate replaces/corrects the existing memory.

Output JSON with format:
{"action": "keep_both"|"ignore"|"merge"|"supersede", "rationale": string, "mergedContent"?: string}`;

    const completion = await this.memoryProvider.complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    });

    const decision = this.parseConsolidationDecision((completion as any).reply ?? completion.content ?? "");
    const nowIso = this.now().toISOString();

    if (decision.action === "ignore") {
      return;
    }

    await this.unitOfWork.withChatTransaction(async (repos) => {
      await this.assertLeaseOwner(job.jobId, repos);
      const conversation = await repos.conversations.get(payload.conversationId);
      const storyWorldId = (payload.storyWorldId ?? conversation?.storyWorldId ?? existingMemory.storyWorldId) as V2StoryWorldId;

      if (decision.action === "keep_both") {
        const newMemory = createV2Memory({
          memoryId: randomUUID(),
          storyWorldId,
          conversationId: payload.conversationId,
          ...(payload.characterId ? { characterId: payload.characterId } : {}),
          kind: payload.candidate.kind,
          content: payload.candidate.content,
          importance: payload.candidate.importance,
          confidence: payload.candidate.confidence,
          sourceMessageIds: payload.candidate.sourceMessageIds,
          status: "active",
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        await repos.memories.create(newMemory);
        return;
      }

      if (decision.action === "supersede") {
        const superseded = await repos.memories.supersede({
          memoryId: existingMemory.memoryId as V2MemoryId,
          updatedAt: nowIso,
        });
        const newMemory = createV2Memory({
          memoryId: randomUUID(),
          storyWorldId,
          conversationId: payload.conversationId,
          ...(payload.characterId ? { characterId: payload.characterId } : {}),
          kind: payload.candidate.kind,
          content: payload.candidate.content,
          importance: payload.candidate.importance,
          confidence: payload.candidate.confidence,
          sourceMessageIds: payload.candidate.sourceMessageIds,
          status: "active",
          supersedesMemoryId: existingMemory.memoryId as V2MemoryId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        await repos.memories.create(newMemory);
        return;
      }

      if (decision.action === "merge") {
        const mergedText = decision.mergedContent?.trim() || `${existingMemory.content}; ${payload.candidate.content}`;
        await repos.memories.supersede({
          memoryId: existingMemory.memoryId as V2MemoryId,
          updatedAt: nowIso,
        });
        const combinedSourceIds = Array.from(
          new Set([...existingMemory.sourceMessageIds, ...payload.candidate.sourceMessageIds]),
        );
        const newMemory = createV2Memory({
          memoryId: randomUUID(),
          storyWorldId,
          conversationId: payload.conversationId,
          ...(payload.characterId ? { characterId: payload.characterId } : {}),
          kind: payload.candidate.kind,
          content: mergedText,
          importance: Math.max(existingMemory.importance, payload.candidate.importance),
          confidence: Math.max(existingMemory.confidence, payload.candidate.confidence),
          sourceMessageIds: combinedSourceIds,
          status: "active",
          supersedesMemoryId: existingMemory.memoryId as V2MemoryId,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        await repos.memories.create(newMemory);
      }
    });
  }

  private async handleConversationSummary(job: V2ChatMaintenanceJob): Promise<void> {
    const payload = job.payload as unknown as V2ConversationSummaryPayload;
    if (!payload || !payload.sourceMessageIds || payload.sourceMessageIds.length === 0) {
      throw new SourceMessageNotFoundError("Summary job payload has no sourceMessageIds");
    }

    const sortedMessages = await this.unitOfWork.withChatTransaction(async (repos) => {
      return this.resolveSourceMessages(repos.messages, payload.conversationId, payload.sourceMessageIds);
    });

    const existingSummary = await this.unitOfWork.withChatTransaction(async (repos) => {
      return repos.summaries.get(payload.conversationId);
    });
    if (
      payload.previousSummaryVersion !== undefined &&
      existingSummary !== undefined &&
      existingSummary.version !== payload.previousSummaryVersion
    ) {
      return;
    }

    const prompt = `You are a conversational summary agent. Generate an updated, cohesive summary of the story/conversation so far.
The summary MUST:
1. Cover the key plot points and emotional state.
2. Be between 200 and 800 words (concise and factual).
3. Integrate the previous summary if provided.

Previous Summary:
${existingSummary?.summary ?? "None"}

New Messages to incorporate:
${sortedMessages.map((m) => `${m.role.toUpperCase()}: ${m.text ?? ""}`).join("\n")}

Respond with the summary text only:`;

    const completion = await this.memoryProvider.complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    let summaryText = ((completion as any).reply ?? completion.content ?? "").trim();
    if (summaryText.length > 2000) {
      summaryText = summaryText.slice(0, 1997) + "...";
    }

    const toMessageId = sortedMessages[sortedMessages.length - 1]!.messageId;
    const nowIso = this.now().toISOString();

    const summaryRecord = createV2ConversationSummary({
      conversationId: payload.conversationId,
      summary: summaryText,
      coveredUntilMessageId: toMessageId,
      sourceMessageCount: sortedMessages.length + (existingSummary?.sourceMessageCount ?? 0),
      version: (existingSummary?.version ?? 0) + 1,
      updatedAt: nowIso,
    });

    await this.unitOfWork.withChatTransaction(async (repos) => {
      await this.assertLeaseOwner(job.jobId, repos);
      await repos.summaries.save(summaryRecord);
    });
  }

  private async handleStoryAnalyze(job: V2ChatMaintenanceJob): Promise<void> {
    const payload = job.payload as V2StoryAnalyzePayload;
    let worldName: string | undefined;
    let worldSummary: string | undefined;
    let characterName: string | undefined;
    let personaText: string | undefined;
    let conversationSummaryText: string | undefined;
    let memoryTexts: string[] = [];
    let messagesToAnalyze: { role: string; text?: string | undefined }[] = [];
    let storyWorldId: V2StoryWorldId | undefined = payload.storyWorldId;
    let baseCanonRevision: V2Revision = 1 as V2Revision;

    await this.unitOfWork.withChatTransaction(async (repos) => {
      const conversation = await repos.conversations.get(payload.conversationId);
      if (conversation) {
        storyWorldId = (conversation.storyWorldId as V2StoryWorldId) ?? storyWorldId;
      }
      if (storyWorldId) {
        const world = await repos.canon.getWorld(storyWorldId);
        if (world) {
          worldName = world.name;
          worldSummary = world.summary;
          baseCanonRevision = (((world as any).revision ?? (world as any).canonRevision ?? 1) as V2Revision);
        }
      }
      const characterId = payload.characterId ?? conversation?.primaryCharacterId;
      if (storyWorldId && characterId) {
        const char = await repos.canon.getCharacter({ storyWorldId, characterId: characterId as any });
        if (char) {
          characterName = char.name;
          personaText = char.personaText;
        }
      }
      const summary = await repos.summaries.get(payload.conversationId);
      if (summary) {
        conversationSummaryText = summary.summary;
      }
      const memories = await repos.memories.listByConversation(payload.conversationId);
      memoryTexts = memories.filter((m) => m.status === "active").map((m) => m.content);

      const messages = await this.resolveSourceMessages(
        repos.messages,
        payload.conversationId,
        payload.sourceMessageIds ?? [],
      );
      messagesToAnalyze = messages.map((m) => ({ role: m.role, text: m.text }));
    });

    if (!storyWorldId) {
      throw new Error(`Cannot analyze story without storyWorldId for conversation ${payload.conversationId}`);
    }

    const prompt = buildStoryAnalyzerPrompt({
      worldName,
      worldSummary,
      characterName,
      personaText,
      conversationSummary: conversationSummaryText,
      memories: memoryTexts,
      messages: messagesToAnalyze,
    });

    const completion = await this.storyAnalysisProvider.complete({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.3,
    });

    const result = parseStoryAnalyzerOutput((completion as any).reply ?? completion.content ?? "");

    if (result.scenes.length > 0) {
      await this.unitOfWork.withChatTransaction(async (repos) => {
        await this.assertLeaseOwner(job.jobId, repos);
        for (const scene of result.scenes) {
          const candidateId = `candidate:scene:${randomUUID()}` as V2CandidateId;
          const sceneId = `scene:${randomUUID()}` as V2SceneId;
          await repos.candidateReviews.createSceneCandidate(
            createV2SceneCandidate({
              candidateId,
              storyWorldId: storyWorldId!,
              baseCanonRevision,
              provenance: {
                source: "llm",
                jobId: job.jobId,
                summary: `From conversation ${payload.conversationId} analysis`,
              },
              payload: {
                scene: {
                  sceneId,
                  title: scene.title,
                  body: scene.body,
                  participantCharacterIds: payload.characterId ? [payload.characterId] : [],
                },
                choices: scene.choices.map((c) => ({
                  label: c.label,
                  ...(c.consequenceSummary ? { consequenceSummary: c.consequenceSummary } : {}),
                })),
                validationNotes: [],
              },
            }),
          );
        }
      });
    }

    const cursorMessageId = payload.toMessageId ?? payload.sourceMessageIds[payload.sourceMessageIds.length - 1];
    if (cursorMessageId !== undefined) {
      await this.unitOfWork.withChatTransaction(async (repos) => {
        await this.assertLeaseOwner(job.jobId, repos);
        await repos.maintenanceJobs.setStoryAnalyzeCursor(payload.conversationId, cursorMessageId as V2MessageId);
      });
    }
  }

  private async resolveSourceMessages(
    messages: V2ChatMessageRepository,
    conversationId: V2ConversationId,
    sourceMessageIds: readonly V2MessageId[],
  ): Promise<readonly V2ChatMessage[]> {
    if (sourceMessageIds.length === 0) {
      throw new SourceMessageNotFoundError("Maintenance job payload has no sourceMessageIds");
    }
    const resolved = await messages.listByIds(conversationId, sourceMessageIds);
    if (resolved.length !== sourceMessageIds.length) {
      const missing = sourceMessageIds.length - resolved.length;
      throw new SourceMessageNotFoundError(
        `SOURCE_MESSAGE_NOT_FOUND: ${missing} of ${sourceMessageIds.length} source messages are missing`,
      );
    }
    return [...resolved].sort((a, b) => {
      const timeA = a.createdAt ? Date.parse(a.createdAt) : 0;
      const timeB = b.createdAt ? Date.parse(b.createdAt) : 0;
      return timeA - timeB;
    });
  }

  private async assertLeaseOwner(
    jobId: string,
    repos: { readonly maintenanceJobs: { isLeaseOwner(input: {
      readonly jobId: string;
      readonly workerId: string;
      readonly now: string;
    }): Promise<boolean> } },
  ): Promise<void> {
    const ownsLease = await repos.maintenanceJobs.isLeaseOwner({
      jobId,
      workerId: this.workerId,
      now: this.now().toISOString(),
    });
    if (!ownsLease) {
      throw new LeaseLostError(`Lease lost for job ${jobId}; refusing to write business results`);
    }
  }

  private parseConsolidationDecision(raw: string): V2ConsolidationDecision {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || typeof parsed.action !== "string") {
        throw new StructuredOutputError("INVALID_SCHEMA", "Consolidation decision must have an action string");
      }
      const action = parsed.action;
      if (!["keep_both", "ignore", "merge", "supersede"].includes(action)) {
        throw new StructuredOutputError("INVALID_SCHEMA", `Unknown consolidation action: ${action}`);
      }
      return {
        action: action as "keep_both" | "ignore" | "merge" | "supersede",
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
        ...(typeof parsed.mergedContent === "string" ? { mergedContent: parsed.mergedContent } : {}),
      };
    } catch (error) {
      if (error instanceof StructuredOutputError) throw error;
      throw new StructuredOutputError("INVALID_JSON", "Consolidation decision is not valid JSON");
    }
  }
}
