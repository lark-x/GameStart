import type {
  V2JobOverviewDto,
  V2JobQuery,
  V2MaintenanceJobStatus,
  V2MaintenanceJobType,
  V2MemoryOverviewDto,
} from "@living-network/contracts/v2";

export type RuntimeLoadState = "idle" | "loading" | "ready" | "error";

export interface MemoryStatusSummary {
  readonly tone: "success" | "danger" | "neutral";
  readonly title: string;
  readonly detail: string;
}

export function shouldShowMemoryStats(total: number): boolean {
  return total > 0;
}

export function buildMemoryStatusSummary(input: {
  readonly loadState: RuntimeLoadState;
  readonly overview: V2MemoryOverviewDto | null;
  readonly error: string | null;
  readonly formatTime: (value: string | undefined) => string;
}): MemoryStatusSummary {
  if (input.loadState === "error") {
    return { tone: "danger", title: "Memory 状态读取失败", detail: input.error ?? "请稍后重试。" };
  }
  if (input.loadState !== "ready" || input.overview === null) {
    return { tone: "neutral", title: "正在读取 Memory 状态", detail: "正在加载长期记忆与最近运行记录。" };
  }
  const extraction = input.overview.extraction.latest;
  const consolidation = input.overview.consolidation.latest;
  if (extraction?.status === "failed") {
    return { tone: "danger", title: "Memory 存在运行异常", detail: `最近一次 Extraction 失败 · ${input.formatTime(extraction.updatedAt)}` };
  }
  if (consolidation?.status === "failed") {
    return { tone: "danger", title: "Memory 存在运行异常", detail: `最近一次 Consolidation 失败 · ${input.formatTime(consolidation.updatedAt)}` };
  }
  if (input.overview.facts.total === 0) {
    return { tone: "neutral", title: "Memory 暂无数据", detail: "完成对话并触发 Memory Extraction 后会显示统计。" };
  }
  if (extraction?.status === "completed") {
    return { tone: "success", title: "Memory 正常", detail: `最近提取成功 · ${input.formatTime(extraction.updatedAt)}` };
  }
  return { tone: "success", title: "Memory 正常", detail: `${input.overview.facts.total} 条 active Memory 可被 Memory Engine 使用。` };
}

export function buildJobQuery(input: {
  readonly statusFilter: string;
  readonly typeFilter: string;
  readonly limit: number;
  readonly cursor?: string;
}): V2JobQuery {
  return {
    ...(input.statusFilter === "" ? {} : { status: input.statusFilter as V2MaintenanceJobStatus }),
    ...(input.typeFilter === "" ? {} : { type: input.typeFilter as V2MaintenanceJobType }),
    limit: input.limit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
  };
}

export function formatRuntimeClientError(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const record = error as { readonly status?: unknown; readonly code?: unknown; readonly message?: unknown };
    if (record.status === 409) return "任务状态已变化，当前不能重新执行。";
    if (typeof record.code === "string" && typeof record.message === "string") return `${record.code}: ${record.message}`;
    if (typeof record.message === "string") return record.message;
  }
  return fallback;
}

export function buildAutomationOverviewCards(overview: V2JobOverviewDto | null): readonly {
  readonly label: string;
  readonly value: number | "—";
  readonly tone: "normal" | "danger" | "secondary";
}[] {
  return [
    { label: "等待中", value: overview?.pending ?? "—", tone: "normal" },
    { label: "已认领", value: overview?.claimed ?? "—", tone: "normal" },
    { label: "运行中", value: overview?.running ?? "—", tone: "normal" },
    { label: "当前失败", value: overview?.failed ?? "—", tone: "danger" },
    { label: "累计完成", value: overview?.completed ?? "—", tone: "secondary" },
  ];
}
