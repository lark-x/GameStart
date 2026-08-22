import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAffinityGain,
  computeMoodLabel,
  generateDefaultRoutines,
  getAffinityTitle,
  getCurrentRoutine,
} from "./index.ts";

test("computeMoodLabel correctly maps VAD values to natural mood labels", () => {
  assert.equal(computeMoodLabel(0.5, 0.4, 0.2), "愉悦期待");
  assert.equal(computeMoodLabel(0.4, 0.1, 0.0), "恬静惬意");
  assert.equal(computeMoodLabel(-0.4, 0.4, 0.0), "心事重重");
  assert.equal(computeMoodLabel(-0.4, 0.1, 0.0), "有些倦怠");
  assert.equal(computeMoodLabel(0.0, 0.0, 0.0), "平静从容");
});

test("getAffinityTitle returns corresponding title for levels 1 to 10", () => {
  assert.equal(getAffinityTitle(1), "初识之客");
  assert.equal(getAffinityTitle(5), "彼此信赖");
  assert.equal(getAffinityTitle(10), "一生守候");
  assert.equal(getAffinityTitle(99), "一生守候");
});

test("applyAffinityGain levels up correctly when EXP threshold is reached", () => {
  const step1 = applyAffinityGain(1, 0, 50);
  assert.equal(step1.level, 1);
  assert.equal(step1.currentExp, 50);
  assert.equal(step1.leveledUp, false);

  const step2 = applyAffinityGain(1, 50, 80);
  assert.equal(step2.level, 2);
  assert.equal(step2.currentExp, 10);
  assert.equal(step2.leveledUp, true);
});

test("getCurrentRoutine finds current activity by matching hour", () => {
  const routines = generateDefaultRoutines("芙宁娜");
  const morning = getCurrentRoutine(routines, 8);
  assert.equal(morning.activityName, "晨间时光与洗漱");

  const afternoon = getCurrentRoutine(routines, 15);
  assert.equal(afternoon.activityName, "午后散步与社交互动");
});
