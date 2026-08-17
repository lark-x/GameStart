import { createHash } from "node:crypto";

import type { PreparedPrompt } from "./types.ts";

export function hashV2PromptContext(input: { readonly messages: readonly unknown[]; readonly templateId: string; readonly templateVersion: string }): string {
  return createHash("sha256")
    .update(JSON.stringify({ templateId: input.templateId, templateVersion: input.templateVersion, messages: input.messages }))
    .digest("hex");
}

export function contextHashOfPrompt(prompt: PreparedPrompt): string {
  return prompt.contextHash;
}
