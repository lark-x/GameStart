<script setup lang="ts">
import { ref } from "vue";
import { ImageIcon, Upload } from "@lucide/vue";

import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import { v2MediaRefToUrl } from "../../adapters";
import type { V2WorkspaceSnapshot } from "../../adapters";

defineProps<{
  snapshot: V2WorkspaceSnapshot;
  loading: boolean;
  uploading: boolean;
  uploadMessage: string | null;
}>();

const emit = defineEmits<{
  uploadManualAsset: [input: { readonly file: File; readonly title: string }];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const title = ref("");
const localError = ref<string | null>(null);

function mediaUrl(mediaRef: string): string | undefined {
  const env = (import.meta as ImportMeta & { readonly env?: Record<string, string | undefined> }).env ?? {};
  return v2MediaRefToUrl(mediaRef, env.VITE_API_BASE || window.location.origin);
}

function chooseFile(): void {
  fileInput.value?.click();
}

function onFileSelected(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  selectedFile.value = file;
  localError.value = null;
  if (file && title.value.trim() === "") title.value = file.name.replace(/\.[^.]+$/, "");
}

function submit(): void {
  if (!selectedFile.value) {
    localError.value = "请选择 PNG、JPEG、WebP 或 GIF 文件。";
    return;
  }
  emit("uploadManualAsset", { file: selectedFile.value, title: title.value.trim() || selectedFile.value.name });
}

function formatBytes(value: number | undefined): string {
  if (value === undefined) return "大小未知";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <div class="assets-workspace">
    <section class="asset-upload" aria-labelledby="manual-asset-title">
      <div class="section-head">
        <div>
          <p>完全由用户提供</p>
          <h3 id="manual-asset-title">上传正式素材</h3>
        </div>
        <Badge tone="info">无需候选审核</Badge>
      </div>
      <form class="upload-form" @submit.prevent="submit">
        <Field for-id="v2-manual-asset-title" label="素材名称">
          <Input id="v2-manual-asset-title" v-model="title" placeholder="例如：雾港车站背景" :disabled="uploading" />
        </Field>
        <input ref="fileInput" class="native-file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="onFileSelected" />
        <div class="file-row">
          <Button variant="secondary" size="md" type="button" :disabled="uploading" @click="chooseFile">
            <ImageIcon :size="16" /> 选择图片
          </Button>
          <span>{{ selectedFile?.name ?? "尚未选择文件" }}</span>
          <span v-if="selectedFile">{{ formatBytes(selectedFile.size) }}</span>
        </div>
        <p v-if="localError" class="error-message" role="alert">{{ localError }}</p>
        <div class="upload-actions">
          <Button variant="primary" size="md" type="submit" :loading="uploading" :disabled="!selectedFile">
            <Upload :size="16" /> 上传到正式素材库
          </Button>
          <span v-if="uploadMessage" role="status">{{ uploadMessage }}</span>
        </div>
      </form>
    </section>

    <section class="asset-library" aria-labelledby="formal-library-title">
      <div class="section-head">
        <div>
          <p>发布可使用的真实资产</p>
          <h3 id="formal-library-title">正式素材库</h3>
        </div>
        <Badge tone="neutral">{{ snapshot.assets.library.length }} 个</Badge>
      </div>
      <div v-if="snapshot.assets.library.length" class="asset-grid">
        <article v-for="asset in snapshot.assets.library" :key="asset.assetId" class="asset-item">
          <img v-if="mediaUrl(asset.thumbnailRef)" :src="mediaUrl(asset.thumbnailRef)" :alt="asset.title" />
          <div class="asset-copy">
            <div class="asset-title-row">
              <strong>{{ asset.title }}</strong>
              <Badge :tone="asset.sourceType === 'manual' ? 'info' : 'success'">{{ asset.sourceType === "manual" ? "人工上传" : "候选通过" }}</Badge>
            </div>
            <span>{{ asset.originalFilename ?? asset.assetId }}</span>
            <span>{{ asset.mimeType ?? "图片" }} · {{ formatBytes(asset.byteSize) }}</span>
          </div>
        </article>
      </div>
      <div v-else class="empty-library">还没有正式素材。上传第一张图片后，它会立即出现在这里。</div>
    </section>
  </div>
</template>

<style scoped>
.assets-workspace { display: grid; gap: var(--space-4); }
.asset-upload, .asset-library { display: grid; gap: var(--space-4); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-soft); }
.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.section-head p { margin: 0 0 var(--space-1); color: var(--primary); font-size: var(--text-xs); font-weight: 800; }
.section-head h3 { margin: 0; color: var(--text-strong); font-size: var(--text-md); }
.upload-form { display: grid; gap: var(--space-3); }
.native-file-input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.file-row, .upload-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); color: var(--muted); font-size: var(--text-sm); }
.error-message { margin: 0; color: var(--danger); font-size: var(--text-sm); }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-3); }
.asset-item { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.asset-item img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; background: var(--surface-soft); }
.asset-copy { display: grid; gap: var(--space-1); padding: var(--space-3); color: var(--muted); font-size: var(--text-xs); }
.asset-title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.asset-title-row strong { overflow-wrap: anywhere; color: var(--text-strong); font-size: var(--text-sm); }
.empty-library { padding: var(--space-6); border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); color: var(--muted); text-align: center; }
</style>
