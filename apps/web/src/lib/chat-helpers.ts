import type { ApiCharacter, ApiConversation, ApiMessage, ApiStickerPack } from "../types";

export function conversationCharacters(item: ApiConversation | undefined, currentCharacterId: string | undefined, characters: ApiCharacter[]): ApiCharacter[] {
  if (!item) return [];
  const memberIds = item.members
    .filter((member) => !member.leftAt && member.characterId !== currentCharacterId)
    .map((member) => member.characterId);
  return memberIds
    .map((id) => characters.find((character) => character.id === id))
    .filter((character): character is ApiCharacter => character !== undefined);
}

export function characterImage(character: ApiCharacter | undefined): string | undefined {
  const value = character?.visualPromptRef?.trim();
  return value && /^(?:https?:\/\/|data:image\/|blob:|\/)/i.test(value) ? value : undefined;
}

export function messageCharacter(message: ApiMessage, characters: ApiCharacter[]): ApiCharacter | undefined {
  return characters.find((character) => character.id === message.authorCharacterId);
}

export function messageTime(message: ApiMessage): string {
  return new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function isMine(message: ApiMessage, currentCharacterId: string | undefined): boolean {
  return message.authorCharacterId === currentCharacterId;
}

export function authorName(message: ApiMessage, currentCharacterId: string | undefined, characters: ApiCharacter[], characterName: string): string {
  if (message.kind === "SYSTEM" || !message.authorCharacterId) return "系统";
  return isMine(message, currentCharacterId) ? "我" : characters.find((c) => c.id === message.authorCharacterId)?.displayName || characterName;
}

export function stickerForMessage(message: ApiMessage, stickerById: Map<string, { mediaRef?: string; label?: string }>) {
  return message.stickerId ? stickerById.get(message.stickerId) : undefined;
}

export function stickerLabel(message: ApiMessage, stickerById: Map<string, { label?: string }>): string {
  const sticker = message.stickerId ? stickerById.get(message.stickerId) : undefined;
  return sticker?.label ?? message.stickerId ?? "未知表情";
}

export function stickerImageUrl(message: ApiMessage, stickerById: Map<string, { mediaRef?: string }>, unavailableImageIds: Set<string>, mediaUrl: (ref: string) => string): string {
  if (unavailableImageIds.has(message.id)) return "";
  const sticker = message.stickerId ? stickerById.get(message.stickerId) : undefined;
  const mediaRef = sticker?.mediaRef;
  return mediaRef ? mediaUrl(mediaRef) : "";
}

export function stickerPackIconUrl(pack: ApiStickerPack, unavailableStickerPackIconIds: Set<string>, mediaUrl: (ref: string) => string): string {
  if (unavailableStickerPackIconIds.has(pack.id)) return "";
  const mediaRef = pack._stickers?.[0]?.mediaRef;
  return mediaRef ? mediaUrl(mediaRef) : "";
}
