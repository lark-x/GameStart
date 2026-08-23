import { createHash } from "node:crypto";
import { V2DomainError } from "../shared/index.ts";

export interface V2ContextSourceRevision {
  readonly kind: string;
  readonly id: string;
  readonly revision: number;
}

export interface V2NarrativeContextFingerprint {
  readonly storyWorldId: string;
  readonly worldRevision: number;
  readonly sources: readonly V2ContextSourceRevision[];
  readonly hash: string;
}

export function buildV2NarrativeContextFingerprint(input: {
  readonly storyWorldId: string;
  readonly worldRevision: number;
  readonly sources: readonly V2ContextSourceRevision[];
}): V2NarrativeContextFingerprint {
  if (!input.storyWorldId || input.storyWorldId.trim().length === 0) {
    throw new V2DomainError("INVALID_INPUT", "storyWorldId must be non-empty");
  }
  if (!Number.isSafeInteger(input.worldRevision) || input.worldRevision < 1) {
    throw new V2DomainError("INVALID_INPUT", "worldRevision must be a positive integer");
  }

  // Deterministically sort sources by kind, id, revision
  const sortedSources = [...input.sources]
    .map((source) => ({
      kind: source.kind.trim(),
      id: source.id.trim(),
      revision: Number(source.revision),
    }))
    .sort((a, b) => {
      const kindCmp = a.kind.localeCompare(b.kind);
      if (kindCmp !== 0) return kindCmp;
      const idCmp = a.id.localeCompare(b.id);
      if (idCmp !== 0) return idCmp;
      return a.revision - b.revision;
    });

  const payloadToHash = {
    storyWorldId: input.storyWorldId.trim(),
    worldRevision: input.worldRevision,
    sources: sortedSources,
  };

  const hash = createHash("sha256")
    .update(JSON.stringify(payloadToHash))
    .digest("hex");

  return {
    storyWorldId: input.storyWorldId.trim(),
    worldRevision: input.worldRevision,
    sources: sortedSources,
    hash,
  };
}
