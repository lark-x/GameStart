export type V2NarrativeDiagnosticSeverity = "error" | "warning" | "info";

export type V2NarrativeDiagnosticCode =
  // P0
  | "MISSING_SCENE_REFERENCE_TARGET"
  | "MISSING_PARTICIPANT_CHARACTER"
  | "MISSING_LOCATION"
  | "INVALID_BLOCK_SPEAKER"
  | "DUPLICATE_REFERENCE"
  | "SCENE_BLOCK_ORDER_INVALID"
  | "QUEST_SCENE_CROSS_WORLD"
  | "CHAPTER_ARC_MISMATCH"
  | "QUEST_CHAPTER_MISMATCH"
  // P1
  | "UNREACHABLE_SCENE"
  | "MISSING_ENTRY_SCENE"
  | "MULTIPLE_ENTRY_SCENES"
  | "DANGLING_CHOICE"
  | "UNREFERENCED_SCENE"
  | "EMPTY_QUEST"
  | "EMPTY_CHAPTER"
  // P2
  | "TIMELINE_ORDER_WARNING"
  | "MENTION_WITHOUT_REFERENCE"
  | "REFERENCE_NOT_MENTIONED"
  | "ORPHAN_LORE"
  | "STATE_GATE_UNKNOWN_VARIABLE"
  | "STATE_CONSEQUENCE_TYPE_MISMATCH";

export interface V2NarrativeDiagnostic {
  readonly code: V2NarrativeDiagnosticCode;
  readonly severity: V2NarrativeDiagnosticSeverity;
  readonly message: string;
  readonly entityType: "scene" | "choice" | "arc" | "chapter" | "quest" | "block" | "reference" | "timeline" | "lore" | "state";
  readonly entityId: string;
  readonly targetId?: string;
}

export interface V2NarrativeDiagnosticsReport {
  readonly valid: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly diagnostics: readonly V2NarrativeDiagnostic[];
}
