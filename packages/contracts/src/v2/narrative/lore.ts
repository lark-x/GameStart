import type {
  V2IdempotencyKey,
  V2Revision,
  V2StoryWorldId,
} from "../shared/index.ts";

export type V2LoreEntryType =
  | "faction"
  | "item"
  | "organization"
  | "species"
  | "culture"
  | "religion"
  | "technology"
  | "concept"
  | "historical_event"
  | "custom";

export interface V2CanonLoreEntry {
  readonly loreEntryId: string;
  readonly storyWorldId: V2StoryWorldId;
  readonly type: V2LoreEntryType;
  readonly customType?: string;
  readonly name: string;
  readonly summary?: string;
  readonly body?: string;
  readonly tags: readonly string[];
  readonly revision: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export type V2LoreEntryDto = V2CanonLoreEntry;

export interface V2CreateLoreEntryRequest {
  readonly loreEntryId?: string;
  readonly type: V2LoreEntryType;
  readonly customType?: string;
  readonly name: string;
  readonly summary?: string;
  readonly body?: string;
  readonly tags?: readonly string[];
  readonly expectedRevision?: V2Revision;
  readonly idempotencyKey?: V2IdempotencyKey;
}

export interface V2UpdateLoreEntryRequest {
  readonly type?: V2LoreEntryType;
  readonly customType?: string | null;
  readonly name?: string;
  readonly summary?: string | null;
  readonly body?: string | null;
  readonly tags?: readonly string[];
  readonly expectedRevision?: V2Revision;
  readonly idempotencyKey?: V2IdempotencyKey;
}

export interface V2LoreEntryWriteResponse {
  readonly item: V2LoreEntryDto;
  readonly revision: V2Revision;
}
