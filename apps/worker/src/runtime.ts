import {
  createEventScheduler,
  type ScheduleMaterializationResult,
  type ScheduleWindow,
  type SchedulerClock,
} from "./scheduler.ts";
import {
  createEventExecutionCoordinator,
  type ExecutionCoordinatorClock,
  type EventExecutionCoordinator,
  type ExecutionStartResultKind,
  type StartEventExecutionInput,
} from "./executor.ts";
import type { TaskQueue } from "./queue.ts";
import type { DomainRepositories } from "../../../packages/database/src/index.ts";

export interface WorkerCycleInput {
  readonly storyWorldId: string;
  readonly window: ScheduleWindow;
  readonly execution: StartEventExecutionInput;
}

export interface WorkerCycleResult {
  readonly materialization: ScheduleMaterializationResult;
  readonly started: readonly {
    readonly occurrenceId: string;
    readonly kind: ExecutionStartResultKind;
  }[];
}

export interface WorkerOccurrenceTask extends Record<string, unknown> {
  readonly occurrenceId: string;
  readonly execution: StartEventExecutionInput;
}

export interface WorkerRuntime {
  readonly repositories: DomainRepositories;
  readonly scheduler: ReturnType<typeof createEventScheduler>;
  readonly executionCoordinator: EventExecutionCoordinator;
  runCycle(input: WorkerCycleInput): Promise<WorkerCycleResult>;
}

export async function materializeAndEnqueue(
  runtime: WorkerRuntime,
  queue: TaskQueue<WorkerOccurrenceTask>,
  input: WorkerCycleInput,
): Promise<ScheduleMaterializationResult> {
  const materialization = await runtime.scheduler.materialize(input.storyWorldId, input.window);
  for (const occurrence of materialization.inserted) {
    await queue.enqueue(occurrence.id, {
      occurrenceId: occurrence.id,
      execution: input.execution,
    });
  }
  return materialization;
}

export async function processWorkerOccurrence(
  runtime: WorkerRuntime,
  task: WorkerOccurrenceTask,
): Promise<ExecutionStartResultKind> {
  const result = await runtime.executionCoordinator.start(task.occurrenceId, task.execution);
  return result.kind;
}

export function createWorkerRuntime(
  repositories: DomainRepositories,
  clocks: { scheduler?: SchedulerClock; execution?: ExecutionCoordinatorClock } = {},
): WorkerRuntime {
  const scheduler = createEventScheduler(repositories, clocks.scheduler);
  const executionCoordinator = createEventExecutionCoordinator(repositories, clocks.execution);
  return {
    repositories,
    scheduler,
    executionCoordinator,
    async runCycle(input): Promise<WorkerCycleResult> {
      const materialization = await scheduler.materialize(input.storyWorldId, input.window);
      const started: Array<{
        occurrenceId: string;
        kind: ExecutionStartResultKind;
      }> = [];
      for (const occurrence of materialization.inserted) {
        const result = await executionCoordinator.start(occurrence.id, input.execution);
        started.push({ occurrenceId: occurrence.id, kind: result.kind });
      }
      return { materialization, started };
    },
  };
}
