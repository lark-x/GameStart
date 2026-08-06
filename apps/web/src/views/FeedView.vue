<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { useAppStore } from "../stores/app.js";
import { errorMessage, type ApiMoment } from "../types";
const store = useAppStore(); const moments = ref<ApiMoment[]>([]); const status = ref("准备加载动态……"); const isLoading = ref(false);
async function loadFeed() { if (!store.currentWorldId || !store.currentCharacterId) { status.value = "请先配置故事世界和当前角色。"; return; } status.value = "正在读取动态……"; isLoading.value = true; try { const result = await store.api.getMoments(store.currentWorldId, store.currentCharacterId); moments.value = result.data ?? []; status.value = moments.value.length ? `最近 ${moments.value.length} 条社交动态` : "这个世界尚无记录"; } catch (e: unknown) { status.value = errorMessage(e); } finally { isLoading.value = false; } }
function author(id: string) { return store.characters.find(c => c.id === id)?.displayName || id.slice(0, 6); }
watch(() => store.currentCharacterId, () => void loadFeed()); onMounted(() => void loadFeed());
</script>
<template>
  <section class="life-page">
    <header class="page-header"><div><p>生活记录</p><h1>朋友圈</h1><span>看看这个世界刚刚发生的事。</span></div><div class="header-right"><small>{{ status }}</small><button class="primary-button" @click="loadFeed" :disabled="isLoading">{{ isLoading ? '刷新中…' : '刷新动态' }}</button></div></header>
    <div v-if="moments.length" class="moment-grid">
      <article v-for="moment in moments" :key="moment.id" class="moment-card">
        <img v-if="moment.imageMediaRef" :src="moment.imageMediaRef" class="moment-image" loading="lazy" />
        <div class="moment-body"><div class="author-line"><span class="mini-avatar">{{ author(moment.authorCharacterId).slice(0, 1) }}</span><div><strong>{{ author(moment.authorCharacterId) }}</strong><time>{{ new Date(moment.publishedAt).toLocaleDateString() }}</time></div></div><p class="moment-text">{{ moment.body }}</p><footer><span>{{ moment.visibility === 'PUBLIC' ? '公开动态' : '仅好友可见' }}</span><button>♡ 喜欢</button></footer></div>
      </article>
    </div>
    <div v-else class="empty-state"><span>✦</span><strong>还没有新的生活记录</strong><p>当角色开始生活，这里会慢慢热闹起来。</p></div>
  </section>
</template>
<style scoped>
.life-page{position:relative;z-index:1;height:100%;overflow:auto;padding:38px 54px;color:#4d433d}.page-header{max-width:1160px;margin:0 auto 27px;display:flex;justify-content:space-between;align-items:end}.page-header p{margin:0 0 6px;color:#b36d57;font-size:11px;font-weight:700;letter-spacing:.16em}.page-header h1{margin:0;color:#463b34;font-size:26px;letter-spacing:.02em}.page-header span{display:block;margin-top:9px;color:#a29891;font-size:13px}.header-right{display:flex;align-items:center;gap:13px}.header-right small{color:#a79b94;font-size:11px}.primary-button{border:0;border-radius:999px;padding:10px 16px;background:#b96049;color:#fff;font-size:12px;box-shadow:0 7px 16px rgba(171,86,63,.18);cursor:pointer}.primary-button:disabled{opacity:.55}.moment-grid{max-width:1160px;margin:auto;columns:3;column-gap:18px}.moment-card{break-inside:avoid;margin:0 0 18px;overflow:hidden;background:#fffdfa;border:1px solid #eee2da;border-radius:18px;box-shadow:0 10px 28px rgba(119,82,60,.06)}.moment-image{display:block;width:100%;max-height:350px;object-fit:cover}.moment-body{padding:16px}.author-line{display:flex;gap:9px;align-items:center}.mini-avatar{display:grid;place-items:center;width:31px;height:31px;border-radius:50%;background:#f0d5c8;color:#99513d;font-size:12px;font-weight:700}.author-line div{display:grid;gap:2px}.author-line strong{font-size:13px}.author-line time{color:#aaa098;font-size:10px}.moment-text{margin:14px 0;color:#5d5049;font-size:13px;line-height:1.7;white-space:pre-wrap}.moment-body footer{display:flex;justify-content:space-between;padding-top:11px;border-top:1px solid #f2e8e1;color:#aa8c80;font-size:10px}.moment-body footer button{border:0;background:transparent;color:#bd745e;font-size:11px;cursor:pointer}.empty-state{max-width:1160px;height:330px;margin:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed #e5d7cd;border-radius:20px;background:rgba(255,253,250,.56);color:#9b8f87}.empty-state span{font-size:28px;color:#d7967e}.empty-state strong{margin-top:12px;font-size:14px;color:#665951}.empty-state p{margin:6px 0 0;font-size:12px}@media(max-width:1100px){.moment-grid{columns:2}.life-page{padding:30px}} 
</style>
