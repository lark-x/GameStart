<script setup lang="ts">
import { computed } from "vue";
import { useTheme } from "../../lib/theme";

/**
 * 全屏主题点缀层：随皮肤切换渲染不同的飘落/漂浮粒子，
 * 让每个主题不止于配色变化。粒子位置使用确定性伪随机，
 * 避免每次渲染跳变；整体遵循 prefers-reduced-motion 关闭动画。
 */
const { currentThemeMeta } = useTheme();

interface Particle {
  left: string;
  top?: string;
  size: string;
  delay: string;
  duration: string;
  drift: string;
  opacity: number;
  tilt?: string;
}

/** 确定性伪随机数（0~1），保证粒子布局稳定 */
function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

const PARTICLE_COUNT: Record<string, number> = {
  rays: 4,
  embers: 16,
  petals: 18,
  leaves: 14,
  bubbles: 16,
  stars: 26,
};

const particles = computed<Particle[]>(() => {
  const kind = currentThemeMeta.value.decoration;
  const count = PARTICLE_COUNT[kind] ?? 12;
  return Array.from({ length: count }, (_, index) => {
    const duration =
      kind === "stars"
        ? 2.4 + seeded(index, 5) * 3.2
        : kind === "rays"
          ? 9 + seeded(index, 5) * 6
          : 11 + seeded(index, 5) * 14;
    const base: Particle = {
      left: `${(seeded(index, 1) * 100).toFixed(2)}%`,
      size: `${(kind === "rays" ? 18 + seeded(index, 2) * 16 : kind === "stars" ? 2 + seeded(index, 2) * 3.4 : 6 + seeded(index, 2) * 11).toFixed(1)}px`,
      delay: `${(-seeded(index, 3) * duration).toFixed(2)}s`,
      duration: `${duration.toFixed(2)}s`,
      drift: `${((seeded(index, 4) - 0.5) * (kind === "rays" ? 6 : 14)).toFixed(1)}vw`,
      opacity: Number((0.35 + seeded(index, 6) * 0.45).toFixed(2)),
    };
    if (kind === "stars") {
      base.top = `${(seeded(index, 7) * 100).toFixed(2)}%`;
    }
    if (kind === "rays") {
      base.top = `${(-20 + seeded(index, 7) * 60).toFixed(2)}%`;
      base.tilt = `${(18 + seeded(index, 8) * 14).toFixed(1)}deg`;
    }
    return base;
  });
});
</script>

<template>
  <div
    class="theme-decorations"
    :data-decor="currentThemeMeta.decoration"
    aria-hidden="true"
  >
    <i
      v-for="(particle, index) in particles"
      :key="`${currentThemeMeta.id}-${index}`"
      class="decor-particle"
      :style="{
        '--x': particle.left,
        '--y': particle.top,
        '--size': particle.size,
        '--delay': particle.delay,
        '--duration': particle.duration,
        '--drift': particle.drift,
        '--po': particle.opacity,
        '--tilt': particle.tilt,
      }"
    />
  </div>
</template>

<style scoped>
.theme-decorations {
  position: fixed;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  pointer-events: none;
}
.decor-particle {
  position: absolute;
  display: block;
  left: var(--x);
  width: var(--size);
  height: var(--size);
  opacity: 0;
  will-change: transform, opacity;
}

/* 樱语 · 飘落的花瓣 */
[data-decor="petals"] .decor-particle {
  top: -6vh;
  border-radius: 62% 38% 58% 42%;
  background: radial-gradient(circle at 32% 28%, var(--decor-soft), var(--decor));
  animation: decor-fall var(--duration) linear var(--delay) infinite;
}

/* 青野 · 旋落的叶片 */
[data-decor="leaves"] .decor-particle {
  top: -6vh;
  border-radius: 2% 68% 2% 68%;
  background: linear-gradient(135deg, var(--decor-soft), var(--decor));
  animation: decor-fall var(--duration) linear var(--delay) infinite;
}

/* 夜幕 · 上升的余烬火星 */
[data-decor="embers"] .decor-particle {
  top: 0;
  border-radius: var(--radius-full);
  background: radial-gradient(circle, var(--decor-soft), var(--decor));
  box-shadow: 0 0 8px 1px var(--decor);
  animation: decor-rise var(--duration) linear var(--delay) infinite;
}

/* 海盐 · 上升的气泡 */
[data-decor="bubbles"] .decor-particle {
  top: 0;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--decor);
  background: radial-gradient(circle at 30% 30%, var(--decor-soft), transparent 62%);
  animation: decor-rise var(--duration) linear var(--delay) infinite;
}

/* 星夜 · 闪烁的星星 */
[data-decor="stars"] .decor-particle {
  top: var(--y);
  border-radius: var(--radius-full);
  background: var(--decor);
  box-shadow: 0 0 6px 1px var(--decor-soft);
  animation: decor-twinkle var(--duration) ease-in-out var(--delay) infinite;
}

/* 暖阳 · 缓缓漂移的光束 */
[data-decor="rays"] .decor-particle {
  top: var(--y);
  width: calc(var(--size) * 1.9);
  height: 46vh;
  border-radius: var(--radius-full);
  background: linear-gradient(180deg, var(--decor-soft), transparent 78%);
  filter: blur(6px);
  transform: rotate(var(--tilt));
  animation: decor-breathe var(--duration) ease-in-out var(--delay) infinite;
}

@keyframes decor-fall {
  0% {
    transform: translate3d(0, -4vh, 0) rotate(0deg);
    opacity: 0;
  }
  8% {
    opacity: var(--po);
  }
  92% {
    opacity: var(--po);
  }
  100% {
    transform: translate3d(var(--drift), 112vh, 0) rotate(340deg);
    opacity: 0;
  }
}
@keyframes decor-rise {
  0% {
    transform: translate3d(0, 0, 0) scale(0.9);
    opacity: 0;
  }
  10% {
    opacity: var(--po);
  }
  90% {
    opacity: var(--po);
  }
  100% {
    transform: translate3d(var(--drift), -110vh, 0) scale(1.06);
    opacity: 0;
  }
}
@keyframes decor-twinkle {
  0%,
  100% {
    opacity: calc(var(--po) * 0.25);
    transform: scale(0.75);
  }
  50% {
    opacity: var(--po);
    transform: scale(1.18);
  }
}
@keyframes decor-breathe {
  0%,
  100% {
    opacity: calc(var(--po) * 0.45);
    transform: rotate(var(--tilt)) translateX(0);
  }
  50% {
    opacity: var(--po);
    transform: rotate(var(--tilt)) translateX(var(--drift));
  }
}

@media (prefers-reduced-motion: reduce) {
  .theme-decorations {
    display: none;
  }
}
@media (max-width: 767px) {
  /* 移动端保留点缀但减半密度，避免干扰小屏阅读 */
  .decor-particle:nth-child(even) {
    display: none;
  }
}
</style>
