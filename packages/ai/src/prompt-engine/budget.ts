export const V2_PROMPT_MESSAGE_OVERHEAD = 4;
export const V2_PROMPT_IMAGE_TOKENS = 768;

export function estimateV2PromptTokens(value: string): number {
  if (value.length === 0) return 0;
  let cjk = 0;
  let ascii = 0;
  for (const char of value) {
    if (/[\u3000-\u9fff\uf900-\ufaff]/.test(char)) cjk += 1;
    else ascii += 1;
  }
  return Math.max(1, cjk + Math.ceil(ascii / 4));
}

export function estimateV2ChatMessageTokens(
  input: { readonly text?: string; readonly imageCount?: number },
  imageTokensPerImage = V2_PROMPT_IMAGE_TOKENS,
): number {
  return estimateV2PromptTokens(input.text?.trim() ?? "") + (input.imageCount ?? 0) * imageTokensPerImage;
}

export function estimateV2PromptMessagesTokens(messages: readonly { readonly content: string }[]): number {
  let total = 0;
  for (const message of messages) {
    total += estimateV2PromptTokens(message.content) + V2_PROMPT_MESSAGE_OVERHEAD;
  }
  return total;
}

export function estimateV2PromptMessagesTokensWithImages(
  messages: readonly { readonly text?: string; readonly imageCount?: number }[],
  imageTokensPerImage = V2_PROMPT_IMAGE_TOKENS,
): number {
  let total = 0;
  for (const message of messages) {
    total += estimateV2ChatMessageTokens(message, imageTokensPerImage) + V2_PROMPT_MESSAGE_OVERHEAD;
  }
  return total;
}

export function truncateV2PromptText(value: string, maxTokens: number, suffix = "…"): string {
  if (estimateV2PromptTokens(value) <= maxTokens) return value;
  const budgetChars = Math.max(1, maxTokens - suffix.length);
  return value.slice(0, budgetChars) + suffix;
}

export function trimV2PromptContext<T>(items: readonly T[], maxTokens: number, tokenOf: (item: T) => number): readonly T[] {
  let used = 0;
  const selected: T[] = [];
  for (const item of items) {
    const tokens = tokenOf(item);
    if (used + tokens > maxTokens) break;
    selected.push(item);
    used += tokens;
  }
  return selected;
}
