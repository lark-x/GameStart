export interface JsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly format?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly items?: JsonSchema;
  readonly oneOf?: readonly JsonSchema[];
}

export const idSchema = { type: "string", minLength: 1 } as const satisfies JsonSchema;
export const nonEmptyStringSchema = {
  type: "string",
  minLength: 1,
} as const satisfies JsonSchema;
export const timestampSchema = {
  type: "string",
  format: "date-time",
} as const satisfies JsonSchema;
export const stringListSchema = {
  type: "array",
  items: nonEmptyStringSchema,
} as const satisfies JsonSchema;
export const workflowObjectSchema = {
  type: "object",
  additionalProperties: true,
} as const satisfies JsonSchema;
