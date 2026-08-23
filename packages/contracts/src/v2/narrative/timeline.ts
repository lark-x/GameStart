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

export interface V2NarrativeTime {
  readonly type: V2NarrativeTimeType;
  readonly displayText: string;
  readonly sortKey?: number;
  readonly certainty: V2NarrativeTimeCertainty;
}
