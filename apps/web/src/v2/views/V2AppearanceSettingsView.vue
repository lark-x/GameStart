<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Check, Palette, Save } from "@lucide/vue";
import { useTheme } from "../../lib/theme";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import { platformErrorMessage, v2PlatformClient } from "./platform.ts";

const client = v2PlatformClient();
const { currentTheme, currentThemeMeta, syncState, setTheme, THEMES } = useTheme();
const selectedTheme = ref(currentTheme.value);
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const message = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const settings = await client.getAppearanceSettings();
    selectedTheme.value = settings.themeId;
    setTheme(settings.themeId);
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取外观设置");
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  message.value = null;
  try {
    const settings = await client.saveAppearanceSettings({ themeId: selectedTheme.value });
    setTheme(settings.themeId);
    message.value = "外观主题已保存。";
  } catch (err) {
    error.value = platformErrorMessage(err, "保存外观设置失败");
  } finally {
    saving.value = false;
  }
}

function preview(themeId: string): void {
  selectedTheme.value = themeId;
  setTheme(themeId);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="v2-appearance-settings">
    <PageHeader

      title="外观"
      description="统一配置平台皮肤。主题切换会立即预览，保存后在本地 SQLite 中成为下次启动的默认主题。"
    >
      <template #actions>
        <Badge :tone="syncState === 'error' ? 'danger' : 'success'">{{ syncState === "synced" ? "已同步" : "本地预览" }}</Badge>
      </template>
    </PageHeader>

    <div v-if="error" class="v2-appearance-message v2-appearance-error" role="alert">{{ error }}</div>
    <div v-if="message" class="v2-appearance-message v2-appearance-success" role="status">{{ message }}</div>

    <section class="v2-theme-preview" aria-labelledby="v2-theme-preview-title">
      <div class="v2-theme-preview-copy">
        <p class="v2-section-kicker">当前预览</p>
        <h2 id="v2-theme-preview-title">{{ currentThemeMeta.symbol }} {{ currentThemeMeta.label }}</h2>
        <p>{{ currentThemeMeta.tagline }}</p>
      </div>
      <Button variant="primary" size="md" :loading="saving" @click="save">
        <Save :size="16" aria-hidden="true" />
        保存主题
      </Button>
    </section>

    <section class="v2-theme-grid" aria-label="主题选择">
      <Button
        v-for="theme in THEMES"
        :key="theme.id"
        variant="secondary"
        size="lg"
        class="v2-theme-card"
        :class="{ selected: selectedTheme === theme.id }"
        :aria-pressed="selectedTheme === theme.id"
        :disabled="loading"
        @click="preview(theme.id)"
      >
        <span class="v2-theme-dot" :style="{ background: theme.dot }" aria-hidden="true" />
        <span class="v2-theme-card-copy">
          <strong>{{ theme.symbol }} {{ theme.label }}</strong>
          <small>{{ theme.tagline }}</small>
        </span>
        <Check v-if="selectedTheme === theme.id" :size="18" aria-hidden="true" />
      </Button>
    </section>

    <div class="v2-theme-note">
      <Palette :size="18" aria-hidden="true" />
      <span>主题只影响界面视觉，不会改变故事内容、模型参数或运行时数据。</span>
    </div>
  </div>
</template>

<style scoped>
.v2-appearance-settings {
  display: grid;
  gap: var(--space-5);
}

.v2-theme-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-6);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--primary-soft);
}

.v2-theme-preview-copy {
  display: grid;
  gap: var(--space-2);
}

.v2-section-kicker {
  margin: 0;
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 800;
  letter-spacing: 0.08em;
}

.v2-theme-preview h2,
.v2-theme-preview p:last-child {
  margin: 0;
}

.v2-theme-preview h2 {
  color: var(--text-strong);
  font-size: var(--text-xl);
}

.v2-theme-preview p:last-child {
  color: var(--muted);
  font-size: var(--text-sm);
}

.v2-theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.v2-theme-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 86px;
  padding: var(--space-4);
  text-align: left;
}

.v2-theme-card.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
}

.v2-theme-dot {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border: 3px solid var(--surface);
  border-radius: var(--radius-full);
  box-shadow: 0 0 0 1px var(--border);
}

.v2-theme-card-copy {
  display: grid;
  flex: 1;
  gap: 3px;
  min-width: 0;
}

.v2-theme-card-copy strong {
  color: var(--text-strong);
  font-size: var(--text-sm);
}

.v2-theme-card-copy small {
  overflow: hidden;
  color: var(--muted);
  font-size: var(--text-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v2-theme-note,
.v2-appearance-message {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.v2-theme-note {
  background: var(--surface);
  color: var(--muted);
}

.v2-appearance-error {
  background: var(--danger-soft);
  color: var(--danger);
}

.v2-appearance-success {
  background: var(--success-soft);
  color: var(--success);
}

@media (max-width: 760px) {
  .v2-theme-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .v2-theme-preview {
    align-items: stretch;
    flex-direction: column;
  }

  .v2-theme-grid {
    grid-template-columns: 1fr;
  }
}
</style>
