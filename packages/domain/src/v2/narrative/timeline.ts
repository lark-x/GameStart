import { V2DomainError } from "../shared/index.ts";

export type V2NarrativeTimeType =
  | "absolute"
  | "relative"
  | "era"
  | "range"
  | "unknown";

export type V2NarrativeTimeCertainty =
  | "exact"
  | "approximate"
  | "disputed"
  | "unknown";

const VALID_TIME_TYPES = new Set<string>(["absolute", "relative", "era", "range", "unknown"]);
const VALID_CERTAINTIES = new Set<string>(["exact", "approximate", "disputed", "unknown"]);

export interface V2NarrativeTime {
  readonly type: V2NarrativeTimeType;
  readonly displayText: string;
  readonly sortKey?: number;
  readonly certainty: V2NarrativeTimeCertainty;
}

export function createV2NarrativeTime(input: {
  readonly type?: V2NarrativeTimeType;
  readonly displayText: string;
  readonly sortKey?: number;
  readonly certainty?: V2NarrativeTimeCertainty;
}): V2NarrativeTime {
  const type = input.type ?? "absolute";
  if (!VALID_TIME_TYPES.has(type)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported narrative time type: ${type}`);
  }
  const certainty = input.certainty ?? "exact";
  if (!VALID_CERTAINTIES.has(certainty)) {
    throw new V2DomainError("INVALID_INPUT", `unsupported narrative time certainty: ${certainty}`);
  }

  return {
    type,
    displayText: assertNonEmptyText(input.displayText, "displayText", 120),
    ...(input.sortKey === undefined ? {} : { sortKey: input.sortKey }),
    certainty,
  };
}

function assertNonEmptyText(value: string, field: string, maxLength: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be between 1 and ${maxLength} characters`);
  }
  return trimmed;
}
