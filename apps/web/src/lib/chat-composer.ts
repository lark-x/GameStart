export const COMPOSER_IMAGE_LIMIT = 9;
export const COMPOSER_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

export const COMPOSER_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export interface ComposerImageLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export interface ComposerImageAttachment<TFile extends ComposerImageLike = ComposerImageLike> {
  readonly id: string;
  readonly file: TFile;
  readonly previewUrl: string;
  readonly sizeLabel: string;
  readonly status: "ready" | "uploading" | "sent" | "failed";
  readonly error?: string;
}

export interface ComposerMessageDraft {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly kind: "TEXT" | "IMAGE";
  readonly text?: string;
  readonly mediaRef?: string;
  readonly suppressAutoReply?: boolean;
}

export function validateComposerImage(file: ComposerImageLike): string | undefined {
  if (!COMPOSER_IMAGE_TYPES.has(file.type)) return "请选择 PNG、JPEG、WebP 或 GIF 图片";
  if (file.size > COMPOSER_IMAGE_MAX_BYTES) return "单张图片不能超过 12MB";
  return undefined;
}

export function imageSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function createComposerImageAttachment<TFile extends ComposerImageLike>(
  file: TFile,
  previewUrl: string,
  id: string,
): ComposerImageAttachment<TFile> {
  return {
    id,
    file,
    previewUrl,
    sizeLabel: imageSizeLabel(file.size),
    status: "ready",
  };
}

export function buildComposerMessageDrafts(input: {
  readonly batchId: string;
  readonly text: string;
  readonly mediaRefs: readonly string[];
}): ComposerMessageDraft[] {
  const text = input.text.trim();
  if (input.mediaRefs.length === 0) {
    return text
      ? [{ id: input.batchId, idempotencyKey: input.batchId, kind: "TEXT", text }]
      : [];
  }
  return input.mediaRefs.map((mediaRef, index) => ({
    id: `${input.batchId}:image:${index + 1}`,
    idempotencyKey: `${input.batchId}:image:${index + 1}`,
    kind: "IMAGE",
    mediaRef,
    ...(index === 0 && text ? { text } : {}),
    ...(index < input.mediaRefs.length - 1 ? { suppressAutoReply: true } : {}),
  }));
}
