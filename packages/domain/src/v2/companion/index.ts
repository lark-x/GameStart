export interface V2CompanionDailyRoutine {
  readonly timeSlot: string;
  readonly startHour: number;
  readonly endHour: number;
  readonly activityName: string;
  readonly locationName: string;
  readonly description: string;
}

export function computeMoodLabel(valence: number, arousal: number, dominance: number): string {
  if (valence >= 0.4 && arousal >= 0.3) return "愉悦期待";
  if (valence >= 0.3 && arousal < 0.2) return "恬静惬意";
  if (valence <= -0.3 && arousal >= 0.3) return "心事重重";
  if (valence <= -0.3 && arousal < 0.2) return "有些倦怠";
  if (arousal >= 0.5) return "精力充沛";
  if (dominance >= 0.5) return "自信满满";
  if (dominance <= -0.3) return "稍显害羞";
  return "平静从容";
}

export function getAffinityTitle(level: number): string {
  const titles = [
    "初识之客",
    "熟络好友",
    "谈笑投机",
    "心有灵犀",
    "彼此信赖",
    "知心知己",
    "情感共鸣",
    "深厚羁绊",
    "灵魂相契",
    "一生守候",
  ];
  return titles[Math.min(Math.max(1, level), 10) - 1] ?? "初识之客";
}

export function calculateMaxExpForLevel(level: number): number {
  return Math.max(1, level) * 120;
}

export function applyAffinityGain(
  currentLevel: number,
  currentExp: number,
  gainedExp: number,
): { level: number; currentExp: number; maxExp: number; leveledUp: boolean } {
  let level = Math.max(1, currentLevel);
  let exp = Math.max(0, currentExp) + gainedExp;
  let maxExp = calculateMaxExpForLevel(level);
  let leveledUp = false;

  while (exp >= maxExp && level < 10) {
    exp -= maxExp;
    level += 1;
    maxExp = calculateMaxExpForLevel(level);
    leveledUp = true;
  }

  if (level >= 10) {
    level = 10;
    exp = Math.min(exp, maxExp);
  }

  return { level, currentExp: exp, maxExp, leveledUp };
}

export function generateDefaultRoutines(characterName: string): readonly V2CompanionDailyRoutine[] {
  return [
    {
      timeSlot: "07:00 - 09:00",
      startHour: 7,
      endHour: 9,
      activityName: "晨间时光与洗漱",
      locationName: "温暖居所",
      description: `${characterName} 正在享受宁静的清晨，泡一杯热饮唤醒一天。`,
    },
    {
      timeSlot: "09:00 - 12:00",
      startHour: 9,
      endHour: 12,
      activityName: "日常事务与灵感探索",
      locationName: "工作坊 / 街区",
      description: `${characterName} 正在专注处理白天的事务，并记录新奇的所见所闻。`,
    },
    {
      timeSlot: "12:00 - 14:00",
      startHour: 12,
      endHour: 14,
      activityName: "午间茶点与小憩",
      locationName: "甜品咖啡店",
      description: `${characterName} 正在品尝美味的甜点，偶尔望向窗外发呆。`,
    },
    {
      timeSlot: "14:00 - 18:00",
      startHour: 14,
      endHour: 18,
      activityName: "午后散步与社交互动",
      locationName: "广场与阳光回廊",
      description: `${characterName} 正在漫步街头，和朋友们交谈，寻找创作灵感。`,
    },
    {
      timeSlot: "18:00 - 21:00",
      startHour: 18,
      endHour: 21,
      activityName: "晚间聚餐与放松",
      locationName: "温馨餐厅",
      description: `${characterName} 正在享用丰盛的晚餐，心情格外愉悦。`,
    },
    {
      timeSlot: "21:00 - 23:30",
      startHour: 21,
      endHour: 24,
      activityName: "睡前阅读与写日记",
      locationName: "私人书房",
      description: `${characterName} 正在灯下记录今天的心情，翻阅着喜欢的书本。`,
    },
    {
      timeSlot: "00:00 - 07:00",
      startHour: 0,
      endHour: 7,
      activityName: "安详梦乡",
      locationName: "静谧卧室",
      description: `${characterName} 已经进入甜美的梦乡中，晚安。`,
    },
  ];
}

export function getCurrentRoutine(
  routines: readonly V2CompanionDailyRoutine[],
  currentHour = new Date().getHours(),
): V2CompanionDailyRoutine {
  const match = routines.find((r) => currentHour >= r.startHour && currentHour < r.endHour);
  return match ?? routines[0] ?? {
    timeSlot: "全天",
    startHour: 0,
    endHour: 24,
    activityName: "自由时光",
    locationName: "随处走走",
    description: "正在度过轻松的自由时光。",
  };
}
