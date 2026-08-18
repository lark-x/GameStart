import { StructuredOutputError } from "../story-analyzer.ts";

export type FactExtractionSubject = {
  readonly entityType: "user" | "character" | "location" | "item" | "faction" | "concept";
  readonly entityId: string;
  readonly label?: string;
};

export type FactExtractionObject = {
  readonly type: "text" | "number" | "boolean" | "entity";
  readonly value: string | number | boolean;
  readonly entityId?: string;
};

export interface FactExtractionOutput {
  readonly subject: FactExtractionSubject;
  readonly predicate: string;
  readonly object: FactExtractionObject;
  readonly kind: "profile" | "preference" | "relationship" | "episodic" | "world_fact";
  readonly text: string;
  readonly changeHint: "new" | "restate" | "corrects" | "replaces_previous" | "unknown";
  readonly epistemicStatus?: "asserted" | "observed" | "reported" | "inferred" | "unknown";
  readonly confidence: number;
  readonly importanceHint: number;
  readonly sourceMessageIds: readonly string[];
}

const KINDS = new Set(["profile", "preference", "relationship", "episodic", "world_fact"]);
const CHANGE_HINTS = new Set(["new", "restate", "corrects", "replaces_previous", "unknown"]);
const EPISTEMIC = new Set(["asserted", "observed", "reported", "inferred", "unknown"]);
const ENTITY_TYPES = new Set(["user", "character", "location", "item", "faction", "concept"]);
const OBJECT_TYPES = new Set(["text", "number", "boolean", "entity"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new StructuredOutputError("INVALID_SCHEMA", `Fact extraction output is missing string field: ${field}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requiredNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new StructuredOutputError("INVALID_SCHEMA", `Fact extraction output is missing finite number field: ${field}`);
  }
  return value;
}

export function parseFactExtractionOutput(rawText: string): readonly FactExtractionOutput[] {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new StructuredOutputError("INVALID_JSON", "Fact extraction output is not valid JSON");
  }
  const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.facts) ? parsed.facts : undefined;
  if (list === undefined) {
    throw new StructuredOutputError("INVALID_SCHEMA", "Fact extraction output must be a JSON array of assertions");
  }
  return list.map((item) => {
    if (!isRecord(item)) {
      throw new StructuredOutputError("INVALID_SCHEMA", "Fact extraction item must be an object");
    }
    const subjectRaw = item.subject;
    if (!isRecord(subjectRaw)) {
      throw new StructuredOutputError("INVALID_SCHEMA", "Fact extraction item must have a subject object");
    }
    const entityType = requiredString(subjectRaw, "entityType");
    if (!ENTITY_TYPES.has(entityType)) {
      throw new StructuredOutputError("INVALID_SCHEMA", `Unsupported subject entityType: ${entityType}`);
    }
    const objectRaw = item.object;
    if (!isRecord(objectRaw)) {
      throw new StructuredOutputError("INVALID_SCHEMA", "Fact extraction item must have an object object");
    }
    const objectType = requiredString(objectRaw, "type");
    if (!OBJECT_TYPES.has(objectType)) {
      throw new StructuredOutputError("INVALID_SCHEMA", `Unsupported object type: ${objectType}`);
    }
    const kind = requiredString(item, "kind");
    if (!KINDS.has(kind)) {
      throw new StructuredOutputError("INVALID_SCHEMA", `Unsupported kind: ${kind}`);
    }
    const changeHint = requiredString(item, "changeHint");
    if (!CHANGE_HINTS.has(changeHint)) {
      throw new StructuredOutputError("INVALID_SCHEMA", `Unsupported changeHint: ${changeHint}`);
    }
    const confidence = requiredNumber(item, "confidence");
    const importanceHint = requiredNumber(item, "importanceHint");
    if (confidence < 0 || confidence > 1) {
      throw new StructuredOutputError("INVALID_SCHEMA", "Fact confidence must be between 0 and 1");
    }
    if (importanceHint < 0 || importanceHint > 1) {
      throw new StructuredOutputError("INVALID_SCHEMA", "Fact importanceHint must be between 0 and 1");
    }
    const sourceMessageIds = item.sourceMessageIds;
    if (!Array.isArray(sourceMessageIds) || sourceMessageIds.length === 0 ||
        !sourceMessageIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
      throw new StructuredOutputError("INVALID_SCHEMA", "Fact extraction item must have a non-empty sourceMessageIds array");
    }
    const epistemicStatus = optionalString(item, "epistemicStatus");
    if (epistemicStatus !== undefined && !EPISTEMIC.has(epistemicStatus)) {
      throw new StructuredOutputError("INVALID_SCHEMA", `Unsupported epistemicStatus: ${epistemicStatus}`);
    }
    const text = requiredString(item, "text");
    if (text.length > 2000) {
      throw new StructuredOutputError("INVALID_SCHEMA", "Fact text must be 2000 characters or shorter");
    }
    const subjectLabel = optionalString(subjectRaw, "label");
    const objectEntityId = optionalString(objectRaw, "entityId");
    const epistemicStatusValue = epistemicStatus === undefined
      ? undefined
      : epistemicStatus as Exclude<FactExtractionOutput["epistemicStatus"], undefined>;
    return {
      subject: {
        entityType: entityType as FactExtractionOutput["subject"]["entityType"],
        entityId: requiredString(subjectRaw, "entityId"),
        ...(subjectLabel === undefined ? {} : { label: subjectLabel }),
      },
      predicate: requiredString(item, "predicate"),
      object: {
        type: objectType as FactExtractionOutput["object"]["type"],
        value: objectRaw.value as string | number | boolean,
        ...(objectEntityId === undefined ? {} : { entityId: objectEntityId }),
      },
      kind: kind as FactExtractionOutput["kind"],
      text,
      changeHint: changeHint as FactExtractionOutput["changeHint"],
      ...(epistemicStatusValue === undefined ? {} : { epistemicStatus: epistemicStatusValue }),
      confidence,
      importanceHint,
      sourceMessageIds: sourceMessageIds.map(String),
    };
  });
}
