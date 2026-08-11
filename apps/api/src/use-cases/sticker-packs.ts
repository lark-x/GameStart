import {
  createSticker as createStickerDomain,
  createStickerPack as createStickerPackDomain,
} from "@living-network/domain";
import type { ApiStore } from "../context.ts";
import { ApiError } from "../helpers.ts";
import { toStickerPackDto, toStickerDto, toStickerPackImportResult } from "../mappers.ts";
import { requireStickerStore } from "../store-helpers.ts";
import type {
  CreateStickerPackRequest,
  StickerPackDto,
  StickerDto,
  StickerPackImportResultDto,
} from "@living-network/contracts";

export async function listStickerPacks(store: ApiStore, storyWorldId: string): Promise<StickerPackDto[]> {
  const stickerStore = requireStickerStore(store);
  if (!(await store.storyWorlds.getById(storyWorldId))) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  return (await stickerStore.stickerPacks.listByStoryWorld(storyWorldId)).map(toStickerPackDto);
}

export async function importStickerPack(store: ApiStore, input: CreateStickerPackRequest, actor?: string, requireTrustedActor = false): Promise<StickerPackImportResultDto> {
  if (requireTrustedActor && actor !== undefined) {
    const character = await store.characters.getById(actor);
    if (!character || character.storyWorldId !== input.storyWorldId) {
      throw new ApiError(403, "FORBIDDEN", "Trusted actor cannot import into this story world");
    }
  }
  const stickerStore = requireStickerStore(store);
  const world = await store.storyWorlds.getById(input.storyWorldId);
  if (!world) throw new ApiError(404, "NOT_FOUND", "Story world not found");
  try {
    const pack = createStickerPackDomain({ id: input.id, storyWorld: world, name: input.name, createdAt: input.createdAt, ...(input.sourceRef === undefined ? {} : { sourceRef: input.sourceRef }) });
    const stickers = input.stickers.map((s) => createStickerDomain({ id: s.id, pack, label: s.label, mediaRef: s.mediaRef, ...(s.tags === undefined ? {} : { tags: s.tags }), createdAt: input.createdAt }));
    await stickerStore.stickerPacks.save(pack);
    for (const sticker of stickers) await stickerStore.stickers.save(sticker);
    return toStickerPackImportResult(pack, stickers);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) throw new ApiError(400, "BAD_REQUEST", error.message);
    throw error;
  }
}

export async function listStickers(store: ApiStore, packId: string): Promise<StickerDto[]> {
  const stickerStore = requireStickerStore(store);
  if (!(await stickerStore.stickerPacks.getById(packId))) throw new ApiError(404, "NOT_FOUND", "Sticker pack not found");
  return (await stickerStore.stickers.listByPack(packId)).map(toStickerDto);
}
