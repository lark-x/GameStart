<script setup lang="ts">
import { computed, onUnmounted, ref, watch, type Component } from "vue";
import {
  CalendarDays,
  Download,
  Image as ImageIcon,
  Images,
  Plus,
  MessageCircle,
  RefreshCw,
  Smile,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "@lucide/vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiImageAsset, type ApiStickerPack } from "../types";
import type { ImageAssetCategory } from "@living-network/contracts";

type CollectionTab = "IMAGES" | "STICKERS";
type CategoryFilter = "ALL" | ImageAssetCategory;

interface CategoryOption {
  value: CategoryFilter;
  label: string;
  icon: Component;
}

type StickerImportMode = "existing" | "new";

interface StickerImportItem {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
  label: string;
  error?: string;
}

const STICKER_IMPORT_LIMIT = 50;
const STICKER_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const STICKER_IMPORT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const store = useAppStore();
const imageAssets = ref<ApiImageAsset[]>([]);
const packs = ref<ApiStickerPack[]>([]);
const activeCollection = ref<CollectionTab>("IMAGES");
const activeCategory = ref<CategoryFilter>("ALL");
const selectedAsset = ref<ApiImageAsset | null>(null);
const unavailableImages = ref(new Set<string>());
const status = ref("准备加载相册…");
const loading = ref(false);
const stickerImportOpen = ref(false);
const stickerImportInput = ref<HTMLInputElement | null>(null);
const stickerImportMode = ref<StickerImportMode>("existing");
const stickerImportPackId = ref("");
const stickerImportNewPackName = ref("");
const stickerImportItems = ref<StickerImportItem[]>([]);
const stickerImportStatus = ref("");
const stickerImporting = ref(false);

const categoryOptions: readonly CategoryOption[] = [
  { value: "ALL", label: "全部", icon: Images },
  { value: "CHAT", label: "聊天配图", icon: MessageCircle },
  { value: "MOMENT", label: "动态配图", icon: Sparkles },
  { value: "EVENT", label: "事件生成", icon: CalendarDays },
];

const visibleAssets = computed(() => activeCategory.value === "ALL"
  ? imageAssets.value
  : imageAssets.value.filter((asset) => asset.category === activeCategory.value));
const canSubmitStickerImport = computed(() => {
  if (stickerImporting.value || stickerImportItems.value.length === 0) return false;
  if (stickerImportMode.value === "new") return stickerImportNewPackName.value.trim().length > 0;
  return stickerImportPackId.value.trim().length > 0;
});

function categoryCount(category: CategoryFilter) {
  return category === "ALL"
    ? imageAssets.value.length
    : imageAssets.value.filter((asset) => asset.category === category).length;
}

function categoryLabel(category: ImageAssetCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? category;
}

function characterName(characterId: string) {
  return store.characters.find((character) => character.id === characterId)?.displayName ?? characterId;
}

function imageUrl(mediaRef: string) {
  return store.api.mediaUrl(mediaRef);
}

function markImageUnavailable(assetId: string) {
  unavailableImages.value = new Set([...unavailableImages.value, assetId]);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadAsset(asset: ApiImageAsset) {
  const anchor = document.createElement("a");
  anchor.href = imageUrl(asset.mediaRef);
  anchor.download = `${asset.category.toLowerCase()}-${asset.id}.png`;
  anchor.rel = "noopener";
  anchor.click();
}

function stickerLabelFromFile(name: string) {
  return name.replace(/\.[^.]+$/, "").trim() || "sticker";
}

function validateStickerFile(file: File) {
  if (!STICKER_IMPORT_TYPES.has(file.type)) return "仅支持 PNG、JPEG、WebP、GIF";
  if (file.size > STICKER_IMPORT_MAX_BYTES) return "单张不能超过 5MB";
  return undefined;
}

function pickStickerImportFiles() {
  stickerImportInput.value?.click();
}

function openStickerImport() {
  activeCollection.value = "STICKERS";
  stickerImportOpen.value = true;
  stickerImportStatus.value = "";
  if (!stickerImportPackId.value && packs.value[0]) stickerImportPackId.value = packs.value[0].id;
  if (!packs.value.length) stickerImportMode.value = "new";
}

function clearStickerImportItems() {
  for (const item of stickerImportItems.value) URL.revokeObjectURL(item.previewUrl);
  stickerImportItems.value = [];
}

function closeStickerImport() {
  if (stickerImporting.value) return;
  stickerImportOpen.value = false;
  stickerImportStatus.value = "";
  clearStickerImportItems();
}

function addStickerImportFiles(files: readonly File[]) {
  const remaining = STICKER_IMPORT_LIMIT - stickerImportItems.value.length;
  if (remaining <= 0) {
    stickerImportStatus.value = `一次最多导入 ${STICKER_IMPORT_LIMIT} 张`;
    return;
  }
  const accepted: StickerImportItem[] = [];
  const rejected: string[] = [];
  for (const file of files.slice(0, remaining)) {
    const error = validateStickerFile(file);
    if (error) {
      rejected.push(`${file.name}: ${error}`);
      continue;
    }
    accepted.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      label: stickerLabelFromFile(file.name),
    });
  }
  if (files.length > remaining) rejected.push(`已达到 ${STICKER_IMPORT_LIMIT} 张上限`);
  stickerImportItems.value = [...stickerImportItems.value, ...accepted];
  stickerImportStatus.value = rejected[0] ?? (accepted.length ? `${stickerImportItems.value.length} 张待导入` : "");
}

function onStickerImportFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  addStickerImportFiles(files);
}

function removeStickerImportItem(id: string) {
  const item = stickerImportItems.value.find((candidate) => candidate.id === id);
  if (item) URL.revokeObjectURL(item.previewUrl);
  stickerImportItems.value = stickerImportItems.value.filter((candidate) => candidate.id !== id);
}

async function submitStickerImport() {
  if (!store.currentWorldId || !canSubmitStickerImport.value) return;
  stickerImporting.value = true;
  stickerImportStatus.value = "正在上传表情…";
  try {
    const stickers = [];
    for (const item of stickerImportItems.value) {
      const uploaded = await store.api.uploadImage(item.file);
      stickers.push({
        id: `sticker:${crypto.randomUUID()}`,
        label: item.label.trim() || stickerLabelFromFile(item.file.name),
        mediaRef: uploaded.data.mediaRef,
      });
    }
    if (stickerImportMode.value === "new") {
      await store.api.importStickerPack({
        id: `sticker-pack:${crypto.randomUUID()}`,
        storyWorldId: store.currentWorldId,
        name: stickerImportNewPackName.value.trim(),
        sourceRef: "album-import",
        createdAt: new Date().toISOString(),
        stickers,
      });
    } else {
      await store.api.importStickersToPack(stickerImportPackId.value, stickers);
    }
    stickerImportStatus.value = "导入完成";
    clearStickerImportItems();
    stickerImportOpen.value = false;
    stickerImportNewPackName.value = "";
    await loadAssets();
  } catch (error: unknown) {
    stickerImportStatus.value = errorMessage(error);
  } finally {
    stickerImporting.value = false;
  }
}

async function loadAssets() {
  if (!store.currentWorldId) {
    status.value = "准备加载相册…";
    return;
  }
  if (!store.currentCharacterId) {
    status.value = "正在初始化角色…";
    return;
  }
  loading.value = true;
  status.value = "正在读取图片和表情包…";
  unavailableImages.value = new Set();
  const failures: string[] = [];
  try {
    const result = await store.api.getImageAssets(store.currentWorldId);
    imageAssets.value = result.data ?? [];
  } catch (error: unknown) {
    imageAssets.value = [];
    failures.push(`图片：${errorMessage(error)}`);
  }
  try {
    const result = await store.api.getStickerPacks(store.currentWorldId);
    packs.value = result.data ?? [];
    await Promise.all(packs.value.map(async (pack) => {
      const stickers = await store.api.getStickers(pack.id);
      pack._stickers = stickers.data ?? [];
    }));
    if (!packs.value.some((pack) => pack.id === stickerImportPackId.value)) stickerImportPackId.value = packs.value[0]?.id ?? "";
    if (!packs.value.length) stickerImportMode.value = "new";
  } catch (error: unknown) {
    packs.value = [];
    failures.push(`表情包：${errorMessage(error)}`);
  } finally {
    loading.value = false;
  }
  status.value = failures.length
    ? failures.join("；")
    : `${imageAssets.value.length} 张图片 · ${packs.value.length} 个表情包`;
}

watch(
  () => [store.currentWorldId, store.currentCharacterId] as const,
  () => void loadAssets(),
  { immediate: true },
);
onUnmounted(() => clearStickerImportItems());
</script>
<template>
  <section class="page assets-page">
    <PageHeader
      eyebrow="收藏与素材"
      title="图片相册"
      description="所有 ComfyUI 生成结果都会保存在这里，并按使用场景自动分类。"
      :status="status"
    >
      <template #actions>
        <Button v-if="activeCollection === 'STICKERS'" variant="secondary" @click="openStickerImport">
          <Upload :size="16" />导入表情
        </Button>
        <Button variant="secondary" :loading="loading" @click="loadAssets">
          <RefreshCw :size="16" />刷新
        </Button>
      </template>
    </PageHeader>

    <nav class="collection-tabs" aria-label="素材类型">
      <button type="button" :class="{ active: activeCollection === 'IMAGES' }" @click="activeCollection = 'IMAGES'">
        <ImageIcon :size="16" />图片 <span>{{ imageAssets.length }}</span>
      </button>
      <button type="button" :class="{ active: activeCollection === 'STICKERS' }" @click="activeCollection = 'STICKERS'">
        <Smile :size="16" />表情包 <span>{{ packs.length }}</span>
      </button>
    </nav>

    <template v-if="activeCollection === 'IMAGES'">
      <div class="category-tabs" role="tablist" aria-label="图片分类">
        <button
          v-for="option in categoryOptions"
          :key="option.value"
          type="button"
          role="tab"
          :aria-selected="activeCategory === option.value"
          :class="{ active: activeCategory === option.value }"
          @click="activeCategory = option.value"
        >
          <component :is="option.icon" :size="15" />
          {{ option.label }}
          <span>{{ categoryCount(option.value) }}</span>
        </button>
      </div>

      <div v-if="visibleAssets.length" class="album-grid">
        <article v-for="asset in visibleAssets" :key="asset.id" class="photo-item">
          <button type="button" class="photo-preview" @click="selectedAsset = asset">
            <img
              v-if="!unavailableImages.has(asset.id)"
              :src="imageUrl(asset.mediaRef)"
              :alt="asset.prompt"
              loading="lazy"
              @error="markImageUnavailable(asset.id)"
            />
            <span v-else class="photo-unavailable"><ImageIcon :size="24" />图片不可用</span>
          </button>
          <div class="photo-info">
            <div class="photo-kind">
              <span>{{ categoryLabel(asset.category) }}</span>
              <time>{{ formatDate(asset.updatedAt) }}</time>
            </div>
            <h2>{{ asset.prompt }}</h2>
            <p>{{ characterName(asset.subjectCharacterId) }} · {{ asset.workflowVersion }}</p>
          </div>
        </article>
      </div>
      <EmptyState
        v-else-if="!loading"
        title="这个分类还没有图片"
        description="ComfyUI 成功生成图片后，会自动出现在对应分类中。"
      >
        <template #icon><Images :size="28" /></template>
      </EmptyState>
    </template>

    <template v-else>
      <div v-if="packs.length" class="pack-grid">
        <article v-for="pack in packs" :key="pack.id" class="pack-card">
          <header>
            <div>
              <p>表情包</p>
              <h2>{{ pack.name }}</h2>
            </div>
            <span>{{ (pack._stickers || []).length }} 张</span>
          </header>
          <div class="sticker-grid">
            <figure v-for="sticker in pack._stickers || []" :key="sticker.id">
              <div><img :src="imageUrl(sticker.mediaRef)" :alt="sticker.label" loading="lazy" /></div>
              <figcaption>{{ sticker.label }}</figcaption>
            </figure>
          </div>
        </article>
      </div>
      <EmptyState v-else-if="!loading" title="还没有表情包" description="导入表情包后会显示在这里。">
        <template #icon><Smile :size="28" /></template>
        <Button variant="secondary" @click="openStickerImport"><Plus :size="16" />导入表情</Button>
      </EmptyState>
    </template>

    <Teleport to="body">
      <div v-if="selectedAsset" class="lightbox" role="presentation" @click.self="selectedAsset = null">
        <section class="lightbox-dialog" role="dialog" aria-modal="true" aria-label="图片详情">
          <header>
            <div>
              <span>{{ categoryLabel(selectedAsset.category) }}</span>
              <h2>{{ characterName(selectedAsset.subjectCharacterId) }}</h2>
            </div>
            <Button variant="ghost" size="icon" title="关闭" aria-label="关闭" @click="selectedAsset = null"><X :size="18" /></Button>
          </header>
          <div class="lightbox-media">
            <img :src="imageUrl(selectedAsset.mediaRef)" :alt="selectedAsset.prompt" />
          </div>
          <div class="lightbox-details">
            <p>{{ selectedAsset.prompt }}</p>
            <dl>
              <div><dt>生成时间</dt><dd>{{ formatDate(selectedAsset.updatedAt) }}</dd></div>
              <div><dt>工作流</dt><dd>{{ selectedAsset.workflowVersion }}</dd></div>
              <div v-if="selectedAsset.seed !== undefined"><dt>种子</dt><dd>{{ selectedAsset.seed }}</dd></div>
            </dl>
          </div>
          <footer>
            <Button variant="secondary" @click="downloadAsset(selectedAsset)"><Download :size="16" />下载</Button>
          </footer>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="stickerImportOpen" class="sticker-import-overlay" role="presentation" @click.self="closeStickerImport">
        <form class="sticker-import-dialog" role="dialog" aria-modal="true" aria-label="导入表情包" @submit.prevent="submitStickerImport">
          <header>
            <div>
              <span>表情包</span>
              <h2>导入表情</h2>
            </div>
            <Button variant="ghost" size="icon" title="关闭" aria-label="关闭" @click="closeStickerImport"><X :size="18" /></Button>
          </header>
          <input ref="stickerImportInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="visually-hidden" @change="onStickerImportFiles" />
          <div class="sticker-import-target">
            <label :class="{ disabled: !packs.length }">
              <input v-model="stickerImportMode" type="radio" value="existing" :disabled="!packs.length" />
              <span>追加到现有主题</span>
            </label>
            <label>
              <input v-model="stickerImportMode" type="radio" value="new" />
              <span>新建主题</span>
            </label>
          </div>
          <select v-if="stickerImportMode === 'existing'" v-model="stickerImportPackId" class="sticker-import-control">
            <option v-for="pack in packs" :key="pack.id" :value="pack.id">{{ pack.name }}</option>
          </select>
          <input v-else v-model="stickerImportNewPackName" class="sticker-import-control" placeholder="主题名称" />
          <div class="sticker-import-pick">
            <Button type="button" variant="secondary" @click="pickStickerImportFiles"><Upload :size="16" />选择图片</Button>
            <span>最多 50 张，每张 5MB，支持 PNG/JPEG/WebP/GIF</span>
          </div>
          <div v-if="stickerImportItems.length" class="sticker-import-list">
            <article v-for="item in stickerImportItems" :key="item.id" class="sticker-import-item">
              <img :src="item.previewUrl" :alt="item.label" />
              <input v-model="item.label" aria-label="表情名称" />
              <Button type="button" variant="ghost" size="icon" title="移除" aria-label="移除" @click="removeStickerImportItem(item.id)"><Trash2 :size="15" /></Button>
            </article>
          </div>
          <p v-if="stickerImportStatus" class="sticker-import-status">{{ stickerImportStatus }}</p>
          <footer>
            <Button type="button" variant="ghost" @click="closeStickerImport">取消</Button>
            <Button type="submit" :loading="stickerImporting" :disabled="!canSubmitStickerImport">导入</Button>
          </footer>
        </form>
      </div>
    </Teleport>
  </section>
</template>
<style scoped>
.assets-page { width: min(100%, 1380px); margin: 0 auto; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.sticker-import-overlay { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 16px; background: rgb(8 10 16 / 68%); backdrop-filter: blur(10px); }
.sticker-import-dialog { display: grid; gap: 12px; width: min(100%, 620px); max-height: calc(100vh - 32px); overflow: hidden; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-lg); }
.sticker-import-dialog > header, .sticker-import-dialog > footer, .sticker-import-pick { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sticker-import-dialog > header span, .sticker-import-pick span, .sticker-import-status { color: var(--muted); font-size: var(--text-xs); }
.sticker-import-dialog > header h2 { color: var(--text-strong); font-size: var(--text-lg); }
.sticker-import-target { display: flex; flex-wrap: wrap; gap: 8px; }
.sticker-import-target label { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: var(--text-sm); }
.sticker-import-target label.disabled { opacity: 0.55; }
.sticker-import-control { min-height: 38px; width: 100%; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-soft); color: var(--text); font: inherit; }
.sticker-import-list { min-height: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 8px; overflow-y: auto; padding-right: 2px; }
.sticker-import-item { display: grid; grid-template-columns: 48px minmax(0, 1fr) 32px; align-items: center; gap: 8px; padding: 6px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-soft); }
.sticker-import-item img { width: 48px; height: 48px; object-fit: contain; border-radius: var(--radius-sm); background: var(--surface); }
.sticker-import-item input { min-width: 0; height: 32px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); }

.collection-tabs, .category-tabs { display: flex; align-items: center; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.collection-tabs { margin-bottom: var(--space-5); border-bottom: 1px solid var(--border); }
.collection-tabs button, .category-tabs button { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 7px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font: inherit; }
.collection-tabs button { position: relative; min-height: 44px; padding: 0 12px; font-size: var(--text-sm); font-weight: 650; }
.collection-tabs button::after { position: absolute; right: 10px; bottom: -1px; left: 10px; height: 2px; background: transparent; content: ""; }
.collection-tabs button.active { color: var(--text-strong); }
.collection-tabs button.active::after { background: var(--primary); }
.collection-tabs span, .category-tabs span { color: var(--faint); font-size: var(--text-xs); }
.category-tabs { margin-bottom: var(--space-4); }
.category-tabs button { min-height: 34px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: var(--text-xs); }
.category-tabs button.active { border-color: color-mix(in srgb, var(--primary) 45%, var(--border)); background: var(--primary-soft); color: var(--primary); }
.album-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }
.photo-item { min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-sm); }
.photo-preview { display: block; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; padding: 0; border: 0; background: var(--surface-soft); cursor: zoom-in; }
.photo-preview img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform var(--motion-fast); }
.photo-preview:hover img { transform: scale(1.025); }
.photo-unavailable { display: grid; place-items: center; align-content: center; gap: 7px; width: 100%; height: 100%; color: var(--muted); font-size: var(--text-xs); }
.photo-info { padding: 11px 12px 13px; }
.photo-kind { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 11px; }
.photo-kind span { color: var(--primary); font-weight: 700; }
.photo-kind time { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.photo-info h2 { display: -webkit-box; min-height: 40px; overflow: hidden; margin: 7px 0 5px; color: var(--text-strong); font-size: var(--text-sm); line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.photo-info p { overflow: hidden; color: var(--muted); font-size: var(--text-xs); text-overflow: ellipsis; white-space: nowrap; }
.pack-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: var(--space-4); }
.pack-card { display: flex; flex-direction: column; min-width: 0; height: 430px; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); }
.pack-card header { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: var(--space-4); }
.pack-card header p { color: var(--muted); font-size: var(--text-xs); }
.pack-card header h2 { color: var(--text-strong); font-size: var(--text-lg); }
.pack-card header span { color: var(--primary); font-size: var(--text-xs); }
.sticker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: var(--space-3); min-height: 0; overflow-y: auto; align-content: start; }
.sticker-grid figure { margin: 0; padding: var(--space-2); border-radius: var(--radius-sm); background: var(--surface-soft); text-align: center; }
.sticker-grid figure > div { display: grid; place-items: center; height: 86px; }
.sticker-grid img { max-width: 100%; max-height: 82px; object-fit: contain; border-radius: var(--radius-sm); }
.sticker-grid figcaption { overflow: hidden; margin-top: 6px; color: var(--muted); font-size: var(--text-xs); text-overflow: ellipsis; white-space: nowrap; }
.lightbox { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 18px; background: rgb(8 10 16 / 74%); }
.lightbox-dialog { display: grid; grid-template-rows: auto minmax(0, 1fr) auto auto; width: min(100%, 980px); max-height: calc(100vh - 36px); overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); box-shadow: var(--shadow-lg); }
.lightbox-dialog > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.lightbox-dialog > header span { color: var(--primary); font-size: var(--text-xs); font-weight: 700; }
.lightbox-dialog > header h2 { color: var(--text-strong); font-size: var(--text-base); }
.lightbox-media { display: grid; min-height: 240px; overflow: hidden; place-items: center; background: var(--surface); }
.lightbox-media img { display: block; max-width: 100%; max-height: min(62vh, 720px); object-fit: contain; }
.lightbox-details { padding: 14px; }
.lightbox-details > p { color: var(--text); font-size: var(--text-sm); line-height: 1.65; white-space: pre-wrap; }
.lightbox-details dl { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 10px; }
.lightbox-details dl div { display: flex; gap: 6px; font-size: var(--text-xs); }
.lightbox-details dt { color: var(--muted); }
.lightbox-details dd { margin: 0; color: var(--text-strong); }
.lightbox-dialog > footer { display: flex; justify-content: flex-end; padding: 10px 14px; border-top: 1px solid var(--border); }
@media (max-width: 640px) {
  .album-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .photo-info { padding: 9px; }
  .photo-kind time { display: none; }
  .photo-info h2 { min-height: 36px; font-size: var(--text-xs); }
  .lightbox { padding: 8px; }
  .lightbox-dialog { max-height: calc(100vh - 16px); }
  .lightbox-media img { max-height: 52vh; }
}
</style>
