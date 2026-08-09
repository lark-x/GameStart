<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "../components/ui/Button.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import Input from "../components/ui/Input.vue";
import PageHeader from "../components/layout/PageHeader.vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiCalendar } from "../types";
const store = useAppStore();
const calendar = ref<ApiCalendar>({
  occurrences: [],
  definitions: [],
  storyWorldId: "",
  startsAt: "",
  endsAt: "",
});
const month = ref(new Date().toISOString().slice(0, 7));
const status = ref("准备加载日历……");
const monthLabel = computed(() =>
  new Date(`${month.value}-01T00:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
  }),
);
async function loadCalendar() {
  if (!store.currentWorldId) return;
  const startsAt = new Date(`${month.value}-01T00:00:00.000Z`);
  if (Number.isNaN(startsAt.getTime())) {
    status.value = "请选择有效月份。";
    return;
  }
  const endsAt = new Date(startsAt);
  endsAt.setUTCMonth(endsAt.getUTCMonth() + 1);
  status.value = "正在读取世界日历……";
  try {
    const result = await store.api.getWorldCalendar(
      store.currentWorldId,
      startsAt.toISOString(),
      endsAt.toISOString(),
    );
    calendar.value = result.data;
    status.value = `${calendar.value.occurrences.length} 个排期 · ${calendar.value.definitions.length} 个事件定义`;
  } catch (e: unknown) {
    status.value = errorMessage(e);
  }
}
watch(
  () => store.currentWorldId,
  () => void loadCalendar(),
  { immediate: true },
);
</script>
<template>
  <section class="page">
    <PageHeader
      eyebrow="故事时间"
      title="世界日程"
      description="让每一次相遇都有值得期待的日期。"
      :status="status"
    >
      <template #actions>
        <Input
          v-model="month"
          type="month"
          class="month-picker"
          aria-label="选择月份"
          @change="loadCalendar"
        />
        <Button @click="loadCalendar">刷新</Button>
      </template>
    </PageHeader>
    <div class="calendar-layout">
      <main>
        <section class="schedule-card">
          <div class="section-title">
            <div>
              <p>{{ monthLabel }}</p>
              <h2>即将发生</h2>
            </div>
            <span>{{ calendar.occurrences.length }} 个安排</span>
          </div>
          <div v-if="calendar.occurrences.length" class="timeline">
            <article v-for="occ in calendar.occurrences" :key="occ.id">
              <time>{{
                new Date(occ.scheduledFor).toLocaleDateString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                })
              }}</time
              ><i></i>
              <div>
                <strong>{{ occ.eventKey }}</strong>
                <p>{{ new Date(occ.scheduledFor).toLocaleString() }}</p>
              </div>
              <em>{{ occ.status }}</em>
            </article>
          </div>
          <div v-else class="inner-empty">
            这个月还没有排期，给故事留一点空白也很好。
          </div>
        </section>
      </main>
      <aside class="template-card">
        <div class="section-title">
          <div>
            <p>事件库</p>
            <h2>可用模板</h2>
          </div>
          <span>{{ calendar.definitions.length }}</span>
        </div>
        <div v-if="calendar.definitions.length" class="template-list">
          <article v-for="def in calendar.definitions" :key="def.id">
            <span>{{ def.triggerSource }}</span
            ><strong>{{ def.name }}</strong
            ><small
              >优先级 {{ def.priority }} ·
              {{ def.targetCharacterIds.length }} 位角色</small
            >
          </article>
        </div>
        <EmptyState
          title="还没有事件模板"
          description="创建事件模板后，它们会显示在这里。"
          ><template #icon>·</template></EmptyState
        >
      </aside>
    </div>
  </section>
</template>
<style scoped>
.month-picker {
  width: auto;
  min-height: 36px;
  font-size: var(--text-sm);
}
/* 主从双栏，窄屏自动降为单列 */
.calendar-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr));
  gap: var(--space-5);
  align-items: start;
}
.schedule-card,
.template-card {
  padding: var(--space-6);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.section-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-5);
}
.section-title p {
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.section-title h2 {
  font-size: var(--text-xl);
  color: var(--text-strong);
}
.section-title > span {
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.timeline {
  display: grid;
}
.timeline article {
  display: grid;
  grid-template-columns: 50px 17px 1fr auto;
  align-items: center;
  gap: 9px;
  min-height: 72px;
  border-bottom: 1px solid var(--border);
}
.timeline article:last-child {
  border-bottom: 0;
}
.timeline time {
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.timeline i {
  width: 9px;
  height: 9px;
  border: 3px solid var(--border-strong);
  border-radius: var(--radius-full);
  background: var(--surface);
  box-shadow: 0 0 0 4px var(--primary-faint);
}
.timeline strong {
  font-size: var(--text-base);
}
.timeline p {
  margin-top: 5px;
  color: var(--muted);
  font-size: var(--text-xs);
}
.timeline em {
  padding: 4px 8px;
  border-radius: var(--radius-full);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
  font-style: normal;
}
.template-list {
  display: grid;
  gap: 10px;
}
.template-list article {
  display: grid;
  gap: 7px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
}
.template-list span {
  width: max-content;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: var(--text-xs);
}
.template-list strong {
  font-size: var(--text-sm);
}
.template-list small {
  color: var(--muted);
  font-size: var(--text-xs);
}
.inner-empty {
  padding: 45px 10px;
  color: var(--muted);
  text-align: center;
  font-size: var(--text-sm);
  line-height: 1.7;
}
</style>
