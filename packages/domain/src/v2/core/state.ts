import { V2DomainError } from "../shared/index.ts";

export type V2TypedStateStoryWorldId = string;
export type V2TypedStateValue = string | number | boolean;
export type V2TypedStateValueType = "string" | "number" | "boolean";
export type V2TypedStateDeltaOperation = "set" | "increment";

export interface V2TypedStateVariable {
  readonly storyWorldId: V2TypedStateStoryWorldId;
  readonly key: string;
  readonly valueType: V2TypedStateValueType;
  readonly defaultValue: V2TypedStateValue;
  readonly createdAt?: string;
}

export interface V2TypedStateDelta {
  readonly stateKey: string;
  readonly operation: V2TypedStateDeltaOperation;
  readonly value: V2TypedStateValue;
}

export interface V2TypedStateDeltaDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly stateKey?: string;
  readonly deltaIndex?: number;
}

export interface V2TypedStateDeltaPreview {
  readonly valid: boolean;
  readonly values: Record<string, V2TypedStateValue>;
  readonly diagnostics: readonly V2TypedStateDeltaDiagnostic[];
}

export function createV2TypedStateVariable(input: {
  readonly storyWorldId: V2TypedStateStoryWorldId;
  readonly key: string;
  readonly valueType: V2TypedStateValueType;
  readonly defaultValue: V2TypedStateValue;
}): V2TypedStateVariable {
  assertValueType(input.valueType);
  assertValueMatchesType(input.defaultValue, input.valueType, input.key);
  return {
    storyWorldId: assertNonEmptyId(input.storyWorldId, "storyWorldId"),
    key: assertStateKey(input.key),
    valueType: input.valueType,
    defaultValue: input.defaultValue,
  };
}

export function buildV2InitialTypedState(schema: readonly V2TypedStateVariable[]): Record<string, V2TypedStateValue> {
  return Object.fromEntries(schema.map((variable) => [variable.key, variable.defaultValue]));
}

export function previewV2TypedStateDelta(input: {
  readonly schema: readonly V2TypedStateVariable[];
  readonly currentValues?: Record<string, V2TypedStateValue>;
  readonly deltas: readonly V2TypedStateDelta[];
}): V2TypedStateDeltaPreview {
  const schemaByKey = new Map(input.schema.map((variable) => [variable.key, variable]));
  const values = { ...buildV2InitialTypedState(input.schema), ...(input.currentValues ?? {}) };
  const diagnostics: V2TypedStateDeltaDiagnostic[] = [];

  for (const [deltaIndex, delta] of input.deltas.entries()) {
    const stateKey = isString(delta.stateKey) ? delta.stateKey : undefined;
    if (!stateKey || !schemaByKey.has(stateKey)) {
      diagnostics.push({
        code: "UNKNOWN_STATE_KEY",
        message: "State delta references a key that is not declared in the state schema",
        ...(stateKey === undefined ? {} : { stateKey }),
        deltaIndex,
      });
      continue;
    }

    const variable = schemaByKey.get(stateKey)!;
    const current = values[stateKey] ?? variable.defaultValue;
    if (delta.operation === "set") {
      if (!valueMatchesType(delta.value, variable.valueType)) {
        diagnostics.push({
          code: "STATE_TYPE_MISMATCH",
          message: `State delta for ${stateKey} must use ${variable.valueType}`,
          stateKey,
          deltaIndex,
        });
        continue;
      }
      values[stateKey] = delta.value;
      continue;
    }

    if (delta.operation === "increment") {
      if (variable.valueType !== "number" || typeof current !== "number" || typeof delta.value !== "number") {
        diagnostics.push({
          code: "STATE_INCREMENT_TYPE_MISMATCH",
          message: `State delta for ${stateKey} can only increment numeric state`,
          stateKey,
          deltaIndex,
        });
        continue;
      }
      values[stateKey] = current + delta.value;
      continue;
    }

    diagnostics.push({
      code: "UNKNOWN_STATE_DELTA_OPERATION",
      message: "State delta operation is not supported",
      stateKey,
      deltaIndex,
    });
  }

  return {
    valid: diagnostics.length === 0,
    values,
    diagnostics,
  };
}

export function applyV2TypedStateDelta(input: {
  readonly schema: readonly V2TypedStateVariable[];
  readonly currentValues?: Record<string, V2TypedStateValue>;
  readonly deltas: readonly V2TypedStateDelta[];
}): Record<string, V2TypedStateValue> {
  const preview = previewV2TypedStateDelta(input);
  if (!preview.valid) {
    throw new V2DomainError("INVALID_INPUT", preview.diagnostics[0]?.message ?? "State delta is invalid");
  }
  return preview.values;
}

function assertNonEmptyId<T extends string>(value: T, field: string): T {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 128) {
    throw new V2DomainError("INVALID_INPUT", `${field} must be a non-empty id up to 128 characters`);
  }
  return value;
}

function assertStateKey(value: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) {
    throw new V2DomainError("INVALID_INPUT", "state key must start with a letter and contain only letters, numbers, and underscores");
  }
  return value;
}

function assertValueType(valueType: string): asserts valueType is V2TypedStateValueType {
  if (valueType !== "string" && valueType !== "number" && valueType !== "boolean") {
    throw new V2DomainError("INVALID_INPUT", "state valueType must be string, number, or boolean");
  }
}

function assertValueMatchesType(value: V2TypedStateValue, valueType: V2TypedStateValueType, key: string): void {
  if (!valueMatchesType(value, valueType)) {
    throw new V2DomainError("INVALID_INPUT", `defaultValue for ${key} must be ${valueType}`);
  }
}

function valueMatchesType(value: V2TypedStateValue, valueType: V2TypedStateValueType): boolean {
  return typeof value === valueType;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
