import type {
  V2ChatMaintenanceJob,
} from "@living-network/domain/v2";
import type {
  V2MemoryKind,
  V2MemoryOverviewDto,
  V2MemoryRunSummaryDto,
  V2IsoDateTime,
} from "@living-network/contracts/v2";
import type { V2MemoryRuntime } from "@living-network/ports/v2";
import type {
  V2SqliteChatMaintenanceJobRepository,
  V2SqliteMemoryRepository,
} from "@living-network/database/v2";
import type { FastifyPluginAsync } from "fastify";

export interface V2MemoryPluginDependencies {
  readonly memoryRepository: V2SqliteMemoryRepository;
  readonly maintenanceJobRepository: V2SqliteChatMaintenanceJobRepository;
  readonly memoryRuntime: V2MemoryRuntime;
}

const iso = (value: string): V2IsoDateTime => value as V2IsoDateTime;

function toRunSummary(job: V2ChatMaintenanceJob): V2MemoryRunSummaryDto {
  return {
    jobId: job.jobId,
    status: job.status,
    ...(job.lastStartedAt === undefined ? {} : { startedAt: iso(job.lastStartedAt) }),
    ...(job.updatedAt === undefined ? {} : { completedAt: iso(job.updatedAt) }),
    ...(job.lastError === undefined ? {} : { error: job.lastError }),
  };
}

export function createV2MemoryPlugin(dependencies: V2MemoryPluginDependencies): FastifyPluginAsync {
  return async (app) => {
    app.get("/overview", async (): Promise<V2MemoryOverviewDto> => {
      const stats = dependencies.memoryRepository.getMemoryFactStats();

      const latestExtraction = dependencies.maintenanceJobRepository.getLatestRun("memory_extract");
      const latestExtractionFailure = dependencies.maintenanceJobRepository.getLatestFailure("memory_extract");
      const latestConsolidation = dependencies.maintenanceJobRepository.getLatestRun("memory_consolidate");
      const latestConsolidationFailure = dependencies.maintenanceJobRepository.getLatestFailure("memory_consolidate");

      const recentFailures = dependencies.maintenanceJobRepository.getRecentMemoryFailures(5);

      return {
        facts: {
          total: stats.total,
          relatedCharacterCount: stats.relatedCharacterCount,
          averageImportance: stats.averageImportance,
          averageConfidence: stats.averageConfidence,
          typeDistribution: stats.typeDistribution.map((item) => ({ kind: item.kind as V2MemoryKind, count: item.count })),
        },
        extraction: {
          ...(latestExtraction === undefined ? {} : { latest: toRunSummary(latestExtraction) }),
          ...(latestExtractionFailure === undefined ? {} : { latestFailure: toRunSummary(latestExtractionFailure) }),
        },
        consolidation: {
          ...(latestConsolidation === undefined ? {} : { latest: toRunSummary(latestConsolidation) }),
          ...(latestConsolidationFailure === undefined ? {} : { latestFailure: toRunSummary(latestConsolidationFailure) }),
        },
        engines: dependencies.memoryRuntime.listEngines().map((engine) => ({ id: engine.id, mode: engine.mode })),
        recentFailures: recentFailures.map(toRunSummary),
      };
    });
  };
}
