export type V2JsonPrimitive = string | number | boolean | null;
export type V2JsonValue = V2JsonPrimitive | readonly V2JsonValue[] | { readonly [key: string]: V2JsonValue };
export type V2JsonObject = { readonly [key: string]: V2JsonValue };
