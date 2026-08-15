<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { Play, Save, RotateCcw, BookOpen, Clock, Gamepad2, ChevronRight, Volume2 } from "@lucide/vue";
import Badge from "../../../components/ui/Badge.vue";
import Button from "../../../components/ui/Button.vue";
import Field from "../../../components/ui/Field.vue";
import Input from "../../../components/ui/Input.vue";
import EmptyState from "../../../components/ui/EmptyState.vue";
import type { V2WorkspaceSnapshot } from "../../adapters";

const props = defineProps<{
  snapshot: V2WorkspaceSnapshot;
  loading: boolean;
  saveLabel: string;
  playerMessage: string | null;
}>();

const emit = defineEmits<{
  "update:saveLabel": [value: string];
  submitChoice: [choiceId: string];
  saveRun: [];
  restoreSave: [];
}>();

// Typewriter effect state
const displayedBody = ref("");
const isTyping = ref(false);
const showBacklog = ref(false);
const backlogHistory = ref<Array<{ title: string; body: string }>>([]);

let timer: number | null = null;

function startTypewriter(text: string) {
  if (timer) clearInterval(timer);
  displayedBody.value = "";
  isTyping.value = true;
  let i = 0;
  timer = window.setInterval(() => {
    if (i < text.length) {
      displayedBody.value += text[i];
      i++;
    } else {
      if (timer) clearInterval(timer);
      isTyping.value = false;
    }
  }, 20);
}

function skipTypewriter() {
  if (isTyping.value && props.snapshot.player?.body) {
    if (timer) clearInterval(timer);
    displayedBody.value = props.snapshot.player.body;
    isTyping.value = false;
  }
}

watch(
  () => props.snapshot.player?.body,
  (newBody) => {
    if (newBody) {
      startTypewriter(newBody);
      if (props.snapshot.player?.title) {
        backlogHistory.value.push({
          title: props.snapshot.player.title,
          body: newBody,
        });
      }
    }
  },
  { immediate: true }
);
</script>

<template>
  <div class="player-workspace">
    <!-- Galgame Main Play Stage -->
    <div v-if="snapshot.player && snapshot.run" class="galgame-stage" @click="skipTypewriter">
      <!-- Top Stage HUD -->
      <div class="stage-hud">
        <div class="scene-badge-wrap">
          <Badge tone="info">{{ snapshot.run.releaseVersion }}</Badge>
          <span class="scene-title-tag">{{ snapshot.player.title }}</span>
        </div>
        <div class="hud-actions">
          <button
            type="button"
            class="hud-btn"
            :class="{ active: showBacklog }"
            @click.stop="showBacklog = !showBacklog"
          >
            <BookOpen :size="14" /> 剧情回看 (LOG)
          </button>
        </div>
      </div>

      <!-- Dialogue & Choice Box (Visual Novel Style) -->
      <div class="dialogue-container">
        <!-- Backlog Drawer Overlay -->
        <div v-if="showBacklog" class="backlog-drawer" @click.stop>
          <div class="backlog-header">
            <strong>历史剧情回放</strong>
            <button class="close-btn" @click="showBacklog = false">关闭</button>
          </div>
          <div class="backlog-content">
            <div v-for="(item, idx) in backlogHistory" :key="idx" class="backlog-item">
              <span class="b-title">【{{ item.title }}】</span>
              <p class="b-body">{{ item.body }}</p>
            </div>
          </div>
        </div>

        <!-- Speaker Name & Body -->
        <div class="dialogue-box">
          <div class="speaker-tag">{{ snapshot.player.title }}</div>
          <div class="dialogue-text">
            {{ displayedBody }}
            <span v-if="isTyping" class="cursor-blink">|</span>
          </div>
        </div>

        <!-- Interactive Choice Options -->
        <div class="choices-container">
          <button
            v-for="choice in snapshot.player.choices"
            :key="choice.choiceId"
            type="button"
            class="galgame-choice-btn"
            :disabled="choice.disabled || loading"
            @click.stop="emit('submitChoice', choice.choiceId)"
          >
            <ChevronRight :size="16" class="choice-arrow" />
            <span class="choice-label">{{ choice.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Empty Runner State -->
    <EmptyState
      v-else
      title="尚未启动游玩运行"
      description="请先在「发布/导出」模块生成不可变发布包，然后启动游玩沙箱。"
    >
      <template #icon>
        <Gamepad2 :size="24" />
      </template>
    </EmptyState>

    <!-- Save & Restore Bar -->
    <div class="save-restore-card">
      <div class="card-header">
        <div class="header-left">
          <Save :size="18" />
          <h3>存档与读档管理 (Save / Restore)</h3>
        </div>
        <Badge v-if="snapshot.save" tone="success">已有存档</Badge>
        <Badge v-else tone="neutral">未存档</Badge>
      </div>

      <form class="save-form" @submit.prevent="emit('saveRun')">
        <div class="save-controls">
          <Field label="存档备注名称">
            <Input
              :model-value="saveLabel"
              :disabled="loading || !snapshot.run"
              id="v2-save-label"
              aria-label="存档名称"
              placeholder="例如：第一章的分歧点存档"
              @update:model-value="emit('update:saveLabel', $event)"
            />
          </Field>
          <div class="save-actions">
            <Button variant="primary" size="md" type="submit" :disabled="!snapshot.run || loading" :loading="loading">
              <Save :size="16" /> 快速存档
            </Button>
            <Button variant="secondary" size="md" :disabled="loading || !snapshot.save" @click="emit('restoreSave')">
              <RotateCcw :size="16" /> 恢复此存档
            </Button>
          </div>
        </div>
        <span v-if="playerMessage" class="feedback-msg">{{ playerMessage }}</span>
      </form>

      <!-- Active Save Details -->
      <div v-if="snapshot.save" class="save-info-pill">
        <Clock :size="14" />
        <span>当前记录：<strong>{{ snapshot.save.label }}</strong> (场景: {{ snapshot.save.currentSceneId }} · 时间: {{ snapshot.save.savedAt }})</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-workspace {
  display: grid;
  gap: var(--space-4);
}

.galgame-stage {
  min-height: 380px;
  background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  user-select: none;
}

.stage-hud {
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
}

.scene-badge-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.scene-title-tag {
  color: #e2e8f0;
  font-size: var(--text-sm);
  font-weight: 600;
}

.hud-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #e2e8f0;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s ease;
}

.hud-btn:hover, .hud-btn.active {
  background: rgba(255, 255, 255, 0.25);
}

.dialogue-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  z-index: 10;
  position: relative;
}

.dialogue-box {
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  min-height: 110px;
  position: relative;
}

.speaker-tag {
  position: absolute;
  top: -12px;
  left: 16px;
  background: var(--primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: var(--radius-xs);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.dialogue-text {
  color: #f8fafc;
  font-size: var(--text-md);
  line-height: 1.6;
  margin-top: 4px;
}

.cursor-blink {
  animation: blink 0.8s infinite;
  color: var(--primary);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.choices-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.galgame-choice-btn {
  background: rgba(30, 41, 59, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #f8fafc;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.galgame-choice-btn:hover:not(:disabled) {
  background: var(--primary);
  border-color: var(--primary);
  transform: translateX(4px);
}

.galgame-choice-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.choice-arrow {
  color: var(--primary);
  flex-shrink: 0;
}

.galgame-choice-btn:hover .choice-arrow {
  color: #fff;
}

.backlog-drawer {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(12px);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  z-index: 20;
}

.backlog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 6px;
  color: #fff;
  font-size: var(--text-xs);
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 11px;
}

.backlog-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.backlog-item {
  font-size: var(--text-xs);
  color: #cbd5e1;
}

.b-title {
  color: var(--primary);
  font-weight: 600;
}

.b-body {
  margin: 2px 0 0 0;
}

.save-restore-card {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-3);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.header-left h3 {
  margin: 0;
  font-size: var(--text-md);
  color: var(--text-strong);
}

.save-controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3);
  align-items: flex-end;
}

.save-actions {
  display: flex;
  gap: var(--space-2);
  padding-bottom: 2px;
}

.save-info-pill {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--muted);
  background: var(--surface);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.feedback-msg {
  font-size: var(--text-xs);
  color: var(--muted);
}

@media (max-width: 640px) {
  .save-controls {
    grid-template-columns: 1fr;
  }
}
</style>
