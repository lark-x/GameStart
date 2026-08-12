import type { ChatProvider } from "@living-network/ai";
import type { DomainRepositories } from "@living-network/database";
import { bestEffortLog, type WorkerLogger } from "./interaction-log.ts";
import type { OutboxQueueTask } from "./outbox-publisher.ts";

export interface CommentAutoReplyInput {
  readonly task: OutboxQueueTask;
  readonly repositories: DomainRepositories;
  readonly provider: ChatProvider;
  readonly logger?: WorkerLogger;
}

/**
 * Process a `moment.comment.created` outbox event and generate an auto-reply
 * from the moment's author character, if appropriate.
 *
 * Rules (per plan Phase 9):
 * - Only player comments on another character's moment trigger auto-reply
 * - AI comments, reply comments, and author's own comments do NOT trigger
 * - Auto-reply ID and idempotency key are deterministic from the source comment
 * - Failure does not roll back the player comment; max 3 retries via BullMQ
 * - Auto-reply is the only model-generated content that bypasses human review
 */
export async function processCommentAutoReply(
  input: CommentAutoReplyInput,
): Promise<{ replied: boolean; reason?: string }> {
  const { task, repositories, provider, logger } = input;
  const correlationId = `auto-reply:${task.eventId}`;

  await bestEffortLog(logger, {
    event: "comment.auto-reply",
    phase: "received",
    correlationId,
    entityId: task.aggregateId,
  });

  // Validate payload
  const payload = task.payload;
  if (!payload || typeof payload !== "object") {
    return { replied: false, reason: "invalid-payload" };
  }
  const {
    momentId,
    interactionId,
    storyWorldId,
    authorCharacterId,
    actorCharacterId,
    text,
  } = payload as Record<string, unknown>;

  if (
    typeof momentId !== "string" ||
    typeof interactionId !== "string" ||
    typeof storyWorldId !== "string" ||
    typeof authorCharacterId !== "string" ||
    typeof actorCharacterId !== "string" ||
    typeof text !== "string"
  ) {
    return { replied: false, reason: "missing-fields" };
  }

  // Rule: Author's own comment does not trigger auto-reply
  if (authorCharacterId === actorCharacterId) {
    return { replied: false, reason: "self-comment" };
  }

  // Load the source interaction to check if it's a reply
  if (!repositories.momentInteractions) {
    return { replied: false, reason: "no-interaction-repo" };
  }
  const sourceInteraction = await repositories.momentInteractions.getByMomentAndActor(
    momentId,
    actorCharacterId,
    "COMMENT",
  );
  // If the source comment is itself a reply, don't auto-reply
  if (sourceInteraction?.replyToInteractionId) {
    return { replied: false, reason: "is-reply" };
  }

  // Load the moment author character
  if (!repositories.characters) {
    return { replied: false, reason: "no-character-repo" };
  }
  const author = await repositories.characters.getById(authorCharacterId);
  if (!author) {
    return { replied: false, reason: "author-not-found" };
  }

  // Load moment for context
  if (!repositories.moments) {
    return { replied: false, reason: "no-moment-repo" };
  }
  const moment = await repositories.moments.getById(momentId);
  if (!moment) {
    return { replied: false, reason: "moment-not-found" };
  }

  // Check if an auto-reply already exists (idempotent)
  const replyId = `auto-reply-${interactionId}`;
  const replyIdempotencyKey = `auto-reply-${interactionId}`;
  if (repositories.momentInteractions) {
    // Check if there's already a reply with this idempotency key
    const allInteractions = await repositories.momentInteractions.listByMoment(momentId);
    const alreadyReplied = allInteractions.some(
      (i) => i.idempotencyKey === replyIdempotencyKey,
    );
    if (alreadyReplied) {
      return { replied: false, reason: "already-replied" };
    }
  }

  // Generate the auto-reply via LLM
  await bestEffortLog(logger, {
    event: "comment.auto-reply",
    phase: "generating",
    correlationId,
    entityId: interactionId,
    worldId: storyWorldId,
  });

  let replyText: string;
  try {
    const result = await provider.complete({
      messages: [
        {
          role: "system",
          content: [
            `You are ${author.displayName}, a character in a story world.`,
            author.personaPrompt ? `About you: ${author.personaPrompt}` : "",
            `You (${author.displayName}) posted this moment: "${moment.body}"`,
            `A reader commented: "${text}"`,
            `Write a brief, in-character reply (1-2 sentences max). Be natural and conversational.`,
            `Do not use quotes or formatting. Just write the reply text.`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      maxTokens: 150,
      temperature: 0.8,
    });
    replyText = result.content.trim();
  } catch (error) {
    await bestEffortLog(logger, {
      event: "comment.auto-reply",
      phase: "generation-failed",
      outcome: "FAILED",
      correlationId,
      entityId: interactionId,
      worldId: storyWorldId,
      message: error,
    });
    // Don't swallow the error — let BullMQ retry (up to 3 times)
    throw error;
  }

  if (replyText.length === 0) {
    return { replied: false, reason: "empty-reply" };
  }

  // Save the auto-reply interaction
  await bestEffortLog(logger, {
    event: "comment.auto-reply",
    phase: "saving",
    correlationId,
    entityId: replyId,
    worldId: storyWorldId,
  });

  const now = new Date().toISOString();
  await repositories.momentInteractions.save({
    id: replyId,
    momentId,
    storyWorldId,
    actorCharacterId: authorCharacterId,
    kind: "COMMENT",
    text: replyText,
    replyToInteractionId: interactionId,
    createdAt: now,
    idempotencyKey: replyIdempotencyKey,
  });

  // Create a feed event for the reply
  if (repositories.socialFeedEvents) {
    const { SocialFeedEventType } = await import("@living-network/domain");
    await repositories.socialFeedEvents.save({
      id: `feed-${replyId}`,
      storyWorldId,
      eventType: SocialFeedEventType.REPLY_CREATED,
      momentId,
      interactionId: replyId,
      actorCharacterId: authorCharacterId,
      createdAt: now,
    });
  }

  // Load context policy for optional relationship/memory candidate creation
  const contextPolicy = repositories.worldContextPolicies
    ? await repositories.worldContextPolicies.getByWorldId(storyWorldId)
    : undefined;

  // Optionally create relationship/memory candidates (not auto-applied)
  if (contextPolicy && (contextPolicy.relationshipsEnabled || contextPolicy.memoriesEnabled)) {
    try {
      const analysisResult = await provider.complete({
        messages: [
          {
            role: "system",
            content: [
              `You are analyzing a social interaction in a story world.`,
              `Character "${author.displayName}" replied to a comment by a reader.`,
              `Original moment: "${moment.body}"`,
              `Reader comment: "${text}"`,
              `Character reply: "${replyText}"`,
              `Analyze if this interaction suggests:`,
              contextPolicy.relationshipsEnabled
                ? `- Any relationship change between the character and reader (affinity, trust, conflict, dependency, each -20 to 20)`
                : "",
              contextPolicy.memoriesEnabled
                ? `- Any new memory the character might form from this interaction`
                : "",
              `Respond in JSON format:`,
              `{"relationship": {"deltaAffinity": 0, "deltaTrust": 0, "deltaConflict": 0, "deltaDependency": 0, "reason": "..."} or null,`,
              ` "memory": "memory content" or null}`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        maxTokens: 200,
        temperature: 0.3,
        responseFormat: "json_object",
      });

      const analysis = JSON.parse(analysisResult.content) as {
        relationship?: { deltaAffinity: number; deltaTrust: number; deltaConflict: number; deltaDependency: number; reason: string } | null;
        memory?: string | null;
      };

      // Create relationship change candidate if suggested
      if (analysis.relationship && repositories.relationshipChangeCandidates) {
        const { createRelationshipChangeCandidate } = await import("@living-network/domain");
        // Find relationship edge between author and actor
        if (repositories.relationshipEdges) {
          const edges = await repositories.relationshipEdges.listByStoryWorld(storyWorldId);
          const edge = edges.find(
            (e) =>
              (e.sourceCharacterId === authorCharacterId && e.targetCharacterId === actorCharacterId) ||
              (e.sourceCharacterId === actorCharacterId && e.targetCharacterId === authorCharacterId),
          );
          if (edge) {
            const candidateId = `rel-candidate-${interactionId}`;
            await repositories.relationshipChangeCandidates.save(
              createRelationshipChangeCandidate({
                id: candidateId,
                storyWorldId,
                edgeId: edge.id,
                sourceType: "INTERACTION",
                sourceRef: interactionId,
                deltaAffinity: Math.max(-20, Math.min(20, analysis.relationship.deltaAffinity)),
                deltaTrust: Math.max(-20, Math.min(20, analysis.relationship.deltaTrust)),
                deltaConflict: Math.max(-20, Math.min(20, analysis.relationship.deltaConflict)),
                deltaDependency: Math.max(-20, Math.min(20, analysis.relationship.deltaDependency)),
                reason: analysis.relationship.reason,
                ruleVersion: "auto-reply-v1",
                createdAt: now,
              }),
            );
          }
        }
      }

      // Create memory candidate if suggested
      if (analysis.memory && repositories.memoryCandidates) {
        const { createMemoryCandidate, MemoryCandidateStatus } = await import("@living-network/domain");
        const candidateId = `memory-candidate-${interactionId}`;
        await repositories.memoryCandidates.save(
          createMemoryCandidate({
            id: candidateId,
            storyWorld: { id: storyWorldId } as import("@living-network/domain").StoryWorld,
            sourceRef: interactionId,
            content: analysis.memory,
            confidence: 0.6,
            status: MemoryCandidateStatus.PENDING,
            createdAt: now,
          }),
        );
      }
    } catch (analysisError) {
      // Don't fail the auto-reply if analysis fails
      await bestEffortLog(logger, {
        event: "comment.auto-reply",
        phase: "analysis-failed",
        outcome: "SKIPPED",
        correlationId,
        entityId: replyId,
        worldId: storyWorldId,
        message: analysisError,
      });
    }
  }

  await bestEffortLog(logger, {
    event: "comment.auto-reply",
    phase: "complete",
    outcome: "SUCCESS",
    correlationId,
    entityId: replyId,
    worldId: storyWorldId,
  });

  return { replied: true };
}
