import type { DatabaseSync } from "node:sqlite";

import type { V2MemoryEngineRunRepository } from "@living-network/ports/v2";

export class V2SqliteMemoryEngineRunRepository implements V2MemoryEngineRunRepository {
  private readonly db: DatabaseSync;

  public constructor(db: DatabaseSync) {
    this.db = db;
  }

  public async start(input: {
    readonly runId: string;
    readonly engineId: string;
    readonly batchId: string;
    readonly inputAssertionCount: number;
  }): Promise<void> {
    this.db.prepare(`
      INSERT INTO v2_memory_engine_runs (
        run_id, engine_id, batch_id, status, started_at, input_assertion_count
      ) VALUES (?, ?, ?, 'running', ?, ?)
    `).run(input.runId, input.engineId, input.batchId, new Date().toISOString(), input.inputAssertionCount);
  }

  public async complete(input: {
    readonly runId: string;
    readonly outputMemoryCount: number;
    readonly durationMs: number;
  }): Promise<void> {
    this.db.prepare(`
      UPDATE v2_memory_engine_runs
      SET status = 'completed', completed_at = ?, output_memory_count = ?, duration_ms = ?
      WHERE run_id = ?
    `).run(new Date().toISOString(), input.outputMemoryCount, input.durationMs, input.runId);
  }

  public async fail(input: {
    readonly runId: string;
    readonly errorCode: string;
    readonly durationMs?: number;
  }): Promise<void> {
    this.db.prepare(`
      UPDATE v2_memory_engine_runs
      SET status = 'failed', completed_at = ?, duration_ms = ?, error_code = ?
      WHERE run_id = ?
    `).run(new Date().toISOString(), input.durationMs ?? null, input.errorCode, input.runId);
  }
}
