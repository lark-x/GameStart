import { V2DomainError } from "../shared/errors.ts";

export interface HierarchyArcLike {
  readonly arcId: string;
}

export interface HierarchyChapterLike {
  readonly chapterId: string;
  readonly arcId: string;
}

export interface HierarchyQuestLike {
  readonly questId: string;
  readonly arcId: string;
  readonly chapterId?: string;
}

export function validateChapterHierarchy(
  input: { readonly arcId: string },
  arc: HierarchyArcLike | null | undefined,
): void {
  if (!arc) {
    throw new V2DomainError("VALIDATION_FAILED", `Arc ${input.arcId} does not exist`);
  }
}

export function validateQuestHierarchy(
  input: { readonly arcId?: string; readonly chapterId?: string },
  chapter: HierarchyChapterLike | null | undefined,
  arc: HierarchyArcLike | null | undefined,
): { arcId: string; chapterId?: string } {
  if (input.chapterId) {
    if (!chapter) {
      throw new V2DomainError("VALIDATION_FAILED", `Chapter ${input.chapterId} does not exist`);
    }
    if (input.arcId && input.arcId !== chapter.arcId) {
      throw new V2DomainError(
        "VALIDATION_FAILED",
        `Quest arcId (${input.arcId}) does not match Chapter's parent arcId (${chapter.arcId})`,
      );
    }
    return {
      arcId: chapter.arcId,
      chapterId: chapter.chapterId,
    };
  }

  if (!input.arcId) {
    throw new V2DomainError("VALIDATION_FAILED", "Quest must belong to either a Chapter or an Arc");
  }

  if (!arc) {
    throw new V2DomainError("VALIDATION_FAILED", `Arc ${input.arcId} does not exist`);
  }

  return { arcId: input.arcId };
}

export function validateSceneHierarchy(
  input: { readonly arcId?: string; readonly chapterId?: string; readonly questId?: string },
  quest: HierarchyQuestLike | null | undefined,
  chapter: HierarchyChapterLike | null | undefined,
  arc: HierarchyArcLike | null | undefined,
): { arcId?: string; chapterId?: string; questId?: string } {
  if (input.questId) {
    if (!quest) {
      throw new V2DomainError("VALIDATION_FAILED", `Quest ${input.questId} does not exist`);
    }
    if (input.chapterId && quest.chapterId && input.chapterId !== quest.chapterId) {
      throw new V2DomainError(
        "VALIDATION_FAILED",
        `Scene chapterId (${input.chapterId}) does not match Quest's parent chapterId (${quest.chapterId})`,
      );
    }
    if (input.arcId && input.arcId !== quest.arcId) {
      throw new V2DomainError(
        "VALIDATION_FAILED",
        `Scene arcId (${input.arcId}) does not match Quest's parent arcId (${quest.arcId})`,
      );
    }
    return {
      arcId: quest.arcId,
      ...(quest.chapterId ? { chapterId: quest.chapterId } : {}),
      questId: quest.questId,
    };
  }

  if (input.chapterId) {
    if (!chapter) {
      throw new V2DomainError("VALIDATION_FAILED", `Chapter ${input.chapterId} does not exist`);
    }
    if (input.arcId && input.arcId !== chapter.arcId) {
      throw new V2DomainError(
        "VALIDATION_FAILED",
        `Scene arcId (${input.arcId}) does not match Chapter's parent arcId (${chapter.arcId})`,
      );
    }
    return {
      arcId: chapter.arcId,
      chapterId: chapter.chapterId,
    };
  }

  if (input.arcId) {
    if (!arc) {
      throw new V2DomainError("VALIDATION_FAILED", `Arc ${input.arcId} does not exist`);
    }
    return { arcId: input.arcId };
  }

  return {};
}

export interface WorldEntityIdSets {
  readonly characterIds: ReadonlySet<string>;
  readonly locationIds: ReadonlySet<string>;
  readonly loreEntryIds: ReadonlySet<string>;
  readonly timelineEventIds: ReadonlySet<string>;
  readonly factIds: ReadonlySet<string>;
  readonly ruleIds: ReadonlySet<string>;
}

export function validateReferenceTargets(
  references: readonly { readonly targetType: string; readonly targetId: string; readonly role: string }[],
  entities: WorldEntityIdSets,
): void {
  let mainLocationCount = 0;

  for (const ref of references) {
    if (ref.role === "location" && ref.targetType === "location") {
      mainLocationCount++;
      if (mainLocationCount > 1) {
        throw new V2DomainError("DUPLICATE_REFERENCE", "A scene can have at most one main location reference");
      }
    }

    switch (ref.targetType) {
      case "character":
        if (!entities.characterIds.has(ref.targetId)) {
          throw new V2DomainError("VALIDATION_FAILED", `Referenced character ${ref.targetId} does not exist`);
        }
        break;
      case "location":
        if (!entities.locationIds.has(ref.targetId)) {
          throw new V2DomainError("VALIDATION_FAILED", `Referenced location ${ref.targetId} does not exist`);
        }
        break;
      case "lore":
        if (!entities.loreEntryIds.has(ref.targetId)) {
          throw new V2DomainError("VALIDATION_FAILED", `Referenced lore entry ${ref.targetId} does not exist`);
        }
        break;
      case "timeline_event":
        if (!entities.timelineEventIds.has(ref.targetId)) {
          throw new V2DomainError("VALIDATION_FAILED", `Referenced timeline event ${ref.targetId} does not exist`);
        }
        break;
      case "fact":
        if (!entities.factIds.has(ref.targetId)) {
          throw new V2DomainError("VALIDATION_FAILED", `Referenced fact ${ref.targetId} does not exist`);
        }
        break;
      case "rule":
        if (!entities.ruleIds.has(ref.targetId)) {
          throw new V2DomainError("VALIDATION_FAILED", `Referenced rule ${ref.targetId} does not exist`);
        }
        break;
      default:
        break;
    }
  }
}

export function validateBlockSpeakers(
  blocks: readonly { readonly kind: string; readonly speakerCharacterId?: string }[],
  characterIds: ReadonlySet<string>,
): void {
  for (const b of blocks) {
    if (b.kind === "dialogue") {
      if (b.speakerCharacterId && !characterIds.has(b.speakerCharacterId)) {
        throw new V2DomainError("VALIDATION_FAILED", `Speaker character ${b.speakerCharacterId} does not exist in story world`);
      }
    } else if (b.speakerCharacterId) {
      throw new V2DomainError("VALIDATION_FAILED", `Non-dialogue block (${b.kind}) cannot have a speakerCharacterId`);
    }
  }
}
