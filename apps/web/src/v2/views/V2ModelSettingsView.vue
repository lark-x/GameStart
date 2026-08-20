<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ChevronRight, Cpu, Plus, RefreshCw, ShieldCheck, Sparkles } from "@lucide/vue";
import type {
  V2ModelBindingDto,
  V2ModelProfileDto,
  V2PlatformCapabilities,
  V2RuntimeCapability,
} from "@living-network/contracts/v2";

import Badge from "../../components/ui/Badge.vue";
import Button from "../../components/ui/Button.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import Modal from "../../components/ui/Modal.vue";
import PageHeader from "../../components/layout/PageHeader.vue";
import Select from "../../components/ui/Select.vue";
import Switch from "../../components/ui/Switch.vue";
import { platformErrorMessage, v2PlatformClient } from "./platform.ts";
import { useNotificationStore } from "../stores/notification.ts";
import {
  buildCapabilityBindingRows,
  buildCapabilityRuntimeItems,
  buildModelProfileSummaries,
  formatCapabilityToggleError,
} from "./models-view-model.ts";

const client = v2PlatformClient();
const toast = useNotificationStore();
const router = useRouter();

const profiles = ref<readonly V2ModelProfileDto[]>([]);
const bindings = ref<readonly V2ModelBindingDto[]>([]);
const capabilities = ref<V2PlatformCapabilities | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const toggling = ref<Set<string>>(new Set());
const toggleError = ref<string | null>(null);
const bindingTarget = ref<string | null>(null);
const bindingSelection = ref<string>("none");
const bindingSaving = ref(false);

const capabilityItems = computed(() => buildCapabilityRuntimeItems(capabilities.value, bindings.value));
const bindingRows = computed(() => buildCapabilityBindingRows(bindings.value));
const profileSummaries = computed(() => buildModelProfileSummaries(profiles.value));

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const [nextProfiles, nextBindings, nextCapabilities] = await Promise.all([
      client.listModelProfiles(),
      client.listModelBindings(),
      client.getCapabilities(),
    ]);
    profiles.value = nextProfiles;
    bindings.value = nextBindings;
    capabilities.value = nextCapabilities;
  } catch (err) {
    error.value = platformErrorMessage(err, "无法读取模型配置");
  } finally {
    loading.value = false;
  }
}

async function toggleCapability(capability: V2RuntimeCapability, enabled: boolean): Promise<void> {
  if (toggling.value.has(capability)) return;
  toggling.value = new Set(toggling.value).add(capability);
  toggleError.value = null;
  try {
    capabilities.value = await client.updateCapability(capability, { enabled });
  } catch (err) {
    toggleError.value = formatCapabilityToggleError(err);
  } finally {
    const next = new Set(toggling.value);
    next.delete(capability);
    toggling.value = next;
  }
}

function openBinding(capability: string): void {
  const binding = bindings.value.find((item) => item.capability === capability);
  bindingSelection.value = binding?.profileId ?? "none";
  bindingTarget.value = capability;
}

function closeBinding(): void {
  bindingTarget.value = null;
}

async function saveBinding(): Promise<void> {
  if (bindingTarget.value === null) return;
  bindingSaving.value = true;
  error.value = null;
  try {
    const selected = bindingSelection.value;
    await client.setModelBinding(bindingTarget.value, { profileId: selected === "none" ? null : selected });
    toast.success("模型绑定已更新。");
    closeBinding();
    await refresh();
  } catch (err) {
    error.value = platformErrorMessage(err, "更新模型绑定失败");
  } finally {
    bindingSaving.value = false;
  }
}

function goToProfile(id: string): void {
  void router.push(`/v2/settings/models/${encodeURIComponent(id)}`);
}

function goToNewProfile(): void {
  void router.push("/v2/settings/models/new");
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <div class="models-page">
    <PageHeader
      title="模型与能力"
      description="管理 AI 能力的运行状态、模型绑定和模型档案。"
    >
      <template #actions>
        <Button variant="secondary" size="md" :loading="loading" @click="refresh">
          <RefreshCw :size="15" aria-hidden="true" />
          刷新
        </Button>
        <Button variant="primary" size="md" @click="goToNewProfile">
          <Plus :size="15" aria-hidden="true" />
          新建模型
        </Button>
      </template>
    </PageHeader>

    <div v-if="error" class="models-alert" role="alert">{{ error }}</div>
    <div v-if="toggleError" class="models-alert models-alert--warning" role="alert">{{ toggleError }}</div>

    <div v-if="loading && profiles.length === 0" class="models-empty" role="status">正在读取模型配置...</div>

    <template v-else>
      <div class="models-overview">
        <section class="models-card" aria-labelledby="models-runtime-title">
          <div class="models-section-head">
            <ShieldCheck :size="18" aria-hidden="true" />
            <h2 id="models-runtime-title">当前运行</h2>
          </div>
          <div class="capability-list">
            <article v-for="item in capabilityItems" :key="item.capability" class="capability-row">
              <div class="capability-row-main">
                <div class="capability-row-head">
                  <span class="capability-name">{{ item.name }}</span>
                  <Switch
                    :model-value="item.enabled"
                    :disabled="toggling.has(item.capability)"
                    :aria-label="`${item.name} 开关`"
                    @update:model-value="(value: boolean) => toggleCapability(item.capability, value)"
                  />
                </div>
                <small class="capability-model">{{ item.modelLabel }}</small>
                <small class="capability-status" :class="`tone-${item.statusTone}`">{{ item.statusLabel }}</small>
              </div>
            </article>
          </div>
        </section>

        <section class="models-card" aria-labelledby="models-binding-title">
          <div class="models-section-head">
            <Sparkles :size="18" aria-hidden="true" />
            <h2 id="models-binding-title">能力绑定</h2>
          </div>
          <div class="binding-list">
            <button
              v-for="row in bindingRows"
              :key="row.capability"
              type="button"
              class="binding-row"
              :aria-label="`${row.label} 当前 ${row.modelLabel}`"
              @click="openBinding(row.capability)"
            >
              <span class="binding-label">{{ row.label }}</span>
              <span class="binding-model" :class="{ muted: row.modelLabel === '未绑定' }">{{ row.modelLabel }}</span>
              <ChevronRight :size="16" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>

      <section class="models-card models-profiles" aria-labelledby="models-profiles-title">
        <div class="models-section-head">
          <Cpu :size="18" aria-hidden="true" />
          <h2 id="models-profiles-title">模型档案</h2>
          <Badge tone="neutral">{{ profiles.length }}</Badge>
        </div>
        <EmptyState
          v-if="profiles.length === 0"
          title="还没有模型档案"
          description="创建模型档案后，可以将其绑定到对话、场景生成或 Memory 等能力。"
        >
          <template #icon><Cpu :size="23" aria-hidden="true" /></template>
        </EmptyState>
        <div v-else class="profile-list">
          <button
            v-for="profile in profileSummaries"
            :key="profile.id"
            type="button"
            class="profile-row"
            @click="goToProfile(profile.id)"
          >
            <span class="profile-name">{{ profile.name }}</span>
            <span class="profile-provider">{{ profile.providerLabel }}</span>
            <span class="profile-modalities">{{ profile.modalityLabel }}</span>
            <Badge :tone="profile.hasApiKey ? 'success' : 'neutral'">{{ profile.hasApiKey ? "已加密" : "无密钥" }}</Badge>
            <ChevronRight :size="16" aria-hidden="true" />
          </button>
        </div>
      </section>
    </template>

    <Modal
      :open="bindingTarget !== null"
      title="选择模型"
      description="为能力选择使用哪个模型档案。模型本身的参数在模型档案详情中配置。"
      @close="closeBinding"
    >
      <div class="models-binding-field">
        <label class="models-binding-label" for="models-binding-select">选择模型档案</label>
        <Select id="models-binding-select" v-model="bindingSelection" aria-label="选择模型">
          <option value="none">不绑定（使用环境变量兜底）</option>
          <option v-for="profile in profiles" :key="profile.id" :value="profile.id">
            {{ profile.name }} · {{ profile.model }}
          </option>
        </Select>
      </div>
      <template #footer>
        <Button variant="secondary" size="md" @click="closeBinding">取消</Button>
        <Button variant="primary" size="md" :loading="bindingSaving" @click="saveBinding">保存绑定</Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.models-page {
  display: grid;
  gap: var(--space-5);
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
}

.models-alert {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: var(--text-sm);
}

.models-alert--warning {
  background: var(--warning-soft);
  color: var(--warning);
}

.models-empty {
  padding: var(--space-8);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  color: var(--muted);
  text-align: center;
}

.models-overview {
  display: grid;
  grid-template-columns: minmax(320px, 0.8fr) minmax(420px, 1.2fr);
  gap: var(--space-5);
  align-items: start;
}

.models-card {
  min-width: 0;
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.models-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.models-section-head h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: var(--text-lg);
}

.capability-list {
  display: grid;
  gap: var(--space-3);
}

.capability-row {
  display: grid;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}

.capability-row-main {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.capability-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.capability-name {
  color: var(--text-strong);
  font-size: var(--text-base);
  font-weight: 700;
}

.capability-model,
.capability-status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}

.capability-model {
  color: var(--text);
}

.capability-status {
  color: var(--muted);
}

.capability-status.tone-success { color: var(--success); }
.capability-status.tone-warning { color: var(--warning); }
.capability-status.tone-danger { color: var(--danger); }
.capability-status.tone-neutral { color: var(--muted); }

.binding-list {
  display: grid;
  gap: var(--space-2);
}

.binding-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, auto) auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.binding-row:hover,
.binding-row:focus-visible {
  border-color: var(--primary);
}

.binding-label {
  color: var(--text-strong);
  font-weight: 700;
  font-size: var(--text-sm);
}

.binding-model {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font-size: var(--text-sm);
}

.binding-model.muted {
  color: var(--muted);
}

.profile-list {
  display: grid;
  gap: var(--space-2);
}

.profile-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.9fr) auto auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  color: var(--text);
  cursor: pointer;
  text-align: left;
}

.profile-row:hover,
.profile-row:focus-visible {
  border-color: var(--primary);
}

.profile-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-strong);
  font-weight: 700;
  font-size: var(--text-sm);
}

.profile-provider,
.profile-modalities {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: var(--text-sm);
}

.models-binding-field {
  display: grid;
  gap: var(--space-2);
}

.models-binding-label {
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 600;
}

@media (max-width: 1000px) {
  .models-overview {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .profile-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "name chevron"
      "meta badge";
  }

  .profile-name { grid-area: name; }
  .profile-provider { grid-area: meta; }
  .profile-modalities { grid-area: meta; justify-self: end; }
  .profile-row > :last-child { grid-area: chevron; }
}
</style>
