/**
 * Deliberately narrow opt-in detector for automatic chat images.  It is not a
 * general "this sounds visual" classifier: a user must explicitly request an
 * image, and the assistant must either acknowledge that request or describe a
 * visual result.  This keeps ordinary story chat from unexpectedly queuing GPU
 * work when the feature is enabled.
 */
const explicitImageRequest = /(?:\b(?:generate|create|draw|make|render)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|illustration|portrait|artwork|wallpaper)\b|\bshow\s+me\s+(?:an?\s+)?(?:image|picture|illustration)\b|(?:生成|制作|创建|画|绘制|做).{0,18}(?:图片|图像|插画|肖像|头像|壁纸|一张图|一幅画))/iu;
const visualReply = /(?:\b(?:image|picture|illustration|portrait|scene|visual|wallpaper)\b|(?:图片|图像|插画|肖像|头像|壁纸|场景|画面|生成|绘制|画一张))/iu;
const acknowledgement = /(?:^|[\s,，。！!])(?:okay|sure|certainly|of course|yes|可以|好的|当然|没问题|行)(?:[\s,，。！!]|$)/iu;
const refusal = /(?:\b(?:cannot|can't|unable|won't)\b.{0,48}\b(?:generate|create|draw|make|image|picture)\b|(?:无法|不能|不可以|不会).{0,24}(?:生成|制作|创建|画|绘制|图片|图像|插画))/iu;

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength).trimEnd();
}

/** Returns a bounded prompt only when the exchange contains explicit image intent. */
export function promptForExplicitChatImageIntent(
  userContent: string | undefined,
  assistantContent: string,
): string | undefined {
  const user = compact(userContent ?? "", 1_000);
  const assistant = compact(assistantContent, 1_500);
  if (!explicitImageRequest.test(user) || assistant.length === 0 || refusal.test(assistant)) {
    return undefined;
  }
  if (!visualReply.test(assistant) && !acknowledgement.test(assistant)) return undefined;
  return `User's explicit image request: ${user}\nAssistant's scene direction: ${assistant}`;
}
