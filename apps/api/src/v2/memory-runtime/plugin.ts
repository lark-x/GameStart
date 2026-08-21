import type {
  V2ChatMaintenanceJob,
} from "@living-network/domain/v2";
import type {
  V2MemoryKind,
  V2MemoryDiagnosticsDto,
  V2MemoryOverviewDto,
  V2MemoryRunSummaryDto,
  V2IsoDateTime,
} from "@living-network/contracts/v2";
import type { V2FactRepository, V2MemoryRuntime } from "@living-network/ports/v2";
import type {
  V2SqliteChatMaintenanceJobRepository,
  V2SqliteMemoryRepository,
} from "@living-network/database/v2";
import type { FastifyPluginAsync } from "fastify";

export interface V2MemoryPluginDependencies {
  readonly memoryRepository: V2SqliteMemoryRepository;
  readonly maintenanceJobRepository: V2SqliteChatMaintenanceJobRepository;
  readonly memoryRuntime: V2MemoryRuntime;
  readonly factRepository: V2FactRepository;
  readonly now?: () => Date;
}

const iso = (value: string): V2IsoDateTime => value as V2IsoDateTime;

function toRunSummary(job: V2ChatMaintenanceJob): V2MemoryRunSummaryDto {
  return {
    jobId: job.jobId,
    status: job.status,
    ...(job.lastStartedAt === undefined ? {} : { startedAt: iso(job.lastStartedAt) }),
    ...(job.updatedAt === undefined ? {} : { updatedAt: iso(job.updatedAt) }),
    ...(job.lastError === undefined ? {} : { error: job.lastError }),
  };
}

export function createV2MemoryPlugin(dependencies: V2MemoryPluginDependencies): FastifyPluginAsync {
  const now = dependencies.now ?? (() => new Date());
  return async (app) => {
    app.get("/overview", async (): Promise<V2MemoryOverviewDto> => {
      const stats = dependencies.memoryRepository.getMemoryFactStats();
      // "关联角色" counts distinct characters actually referenced as fact
      // subjects in the Fact Ledger, not v2_memories.character_id (which is
      // only the conversation's primary character).
      const relatedCharacterCount = await dependencies.factRepository.countDistinctCharacterSubjects();

      const latestExtraction = dependencies.maintenanceJobRepository.getLatestRun("memory_extract");
      const latestExtractionFailure = dependencies.maintenanceJobRepository.getLatestFailure("memory_extract");
      const latestConsolidation = dependencies.maintenanceJobRepository.getLatestRun("memory_consolidate");
      const latestConsolidationFailure = dependencies.maintenanceJobRepository.getLatestFailure("memory_consolidate");

      const recentFailures = dependencies.maintenanceJobRepository.getRecentMemoryFailures(5);

      return {
        facts: {
          total: stats.total,
          relatedCharacterCount,
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

    app.get("/diagnostics", async (): Promise<V2MemoryDiagnosticsDto> => {
      const since = new Date(now().getTime() - 24 * 60 * 60 * 1000).toISOString();
      const jobs = dependencies.maintenanceJobRepository.getMemoryDiagnosticsJobCounts(since);
      const extractionTotal = jobs.extraction.completed + jobs.extraction.failed;
      return {
        window: "24h",
        extraction: {
          completed: jobs.extraction.completed,
          failed: jobs.extraction.failed,
          successRate: extractionTotal === 0 ? null : jobs.extraction.completed / extractionTotal,
        },
        consolidation: jobs.consolidation,
        facts: {
          batchCount: await dependencies.factRepository.countFactBatches(),
          assertionCount: await dependencies.factRepository.countFactAssertions(),
        },
        engineConsume: jobs.engineConsume,
        currentFailedJobs: jobs.currentFailedJobs,
      };
    });
  };
}
