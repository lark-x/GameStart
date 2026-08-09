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
import {
  createEventOutputExecutor,
  type EventOutputExecutor,
  type EventOutputExecutorClock,
} from "./event-outputs.ts";
import type { ChatProvider } from "../../../packages/ai/src/index.ts";
import type { TaskQueue } from "./queue.ts";
import type { DomainRepositories } from "../../../packages/database/src/index.ts";
import { bestEffortLog, type WorkerLogger } from "./interaction-log.ts";

export interface WorkerCycleInput {
  readonly storyWorldId: string;
  readonly window: ScheduleWindow;
  readonly execution: StartEventExecutionInput;
  readonly correlationId?: string;
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
  readonly correlationId?: string;
}

export interface WorkerRuntime {
  readonly repositories: DomainRepositories;
  readonly scheduler: ReturnType<typeof createEventScheduler>;
  readonly executionCoordinator: EventExecutionCoordinator;
  readonly outputExecutor: EventOutputExecutor;
  readonly logger?: WorkerLogger | undefined;
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
  await bestEffortLog(runtime.logger, { event: "occurrence.execution", phase: "received", correlationId: task.correlationId ?? task.occurrenceId, occurrenceId: task.occurrenceId });
  const execution = await withLegacyOutputBudget(runtime.repositories, task);
  const result = await runtime.executionCoordinator.start(task.occurrenceId, execution);
  if (result.kind === "STARTED") {
    await runtime.outputExecutor.execute(result.execution.id);
  }
  await bestEffortLog(runtime.logger, { event: "occurrence.execution", phase: "complete", outcome: result.kind, correlationId: task.correlationId ?? task.occurrenceId, occurrenceId: task.occurrenceId, entityId: result.execution.id });
  return result.kind;
}

/** Legacy calendar records are scheduling-only unless an output was selected. */
async function withLegacyOutputBudget(
  repositories: DomainRepositories,
  task: WorkerOccurrenceTask,
): Promise<StartEventExecutionInput> {
  if (task.execution.proactiveMessageUnits !== undefined || !repositories.scheduledOccurrences || !repositories.worldEventDefinitions) {
    return task.execution;
  }
  const occurrence = await repositories.scheduledOccurrences.getById(task.occurrenceId);
  if (!occurrence) return task.execution;
  const definition = await repositories.worldEventDefinitions.getById(occurrence.definitionId);
  if (!definition) return task.execution;
  if (definition.outputs.sendMessage) return task.execution;
  return { ...task.execution, proactiveMessageUnits: 0 };
}

export function createWorkerRuntime(
  repositories: DomainRepositories,
  clocks: {
    scheduler?: SchedulerClock;
    execution?: ExecutionCoordinatorClock;
    output?: EventOutputExecutorClock;
    messageProvider?: ChatProvider;
    logger?: WorkerLogger;
  } = {},
): WorkerRuntime {
  const scheduler = createEventScheduler(repositories, clocks.scheduler);
  const executionCoordinator = createEventExecutionCoordinator(repositories, clocks.execution);
  const outputExecutor = createEventOutputExecutor(repositories, {
    ...(clocks.output === undefined && clocks.execution === undefined
      ? {}
      : { clock: clocks.output ?? clocks.execution! }),
    ...(clocks.messageProvider === undefined ? {} : { messageProvider: clocks.messageProvider }),
    ...(clocks.logger === undefined ? {} : { logger: clocks.logger }),
  });
  return {
    repositories,
    scheduler,
    executionCoordinator,
    outputExecutor,
    logger: clocks.logger,
    async runCycle(input): Promise<WorkerCycleResult> {
      const materialization = await scheduler.materialize(input.storyWorldId, input.window);
      const started: Array<{
        occurrenceId: string;
        kind: ExecutionStartResultKind;
      }> = [];
      for (const occurrence of materialization.inserted) {
        const adjustedInput = await withLegacyOutputBudget(repositories, {
          occurrenceId: occurrence.id,
          execution: input.execution,
        });
        const result = await executionCoordinator.start(occurrence.id, adjustedInput);
        if (result.kind === "STARTED") await outputExecutor.execute(result.execution.id);
        const kind = result.kind;
        started.push({ occurrenceId: occurrence.id, kind });
      }
      return { materialization, started };
    },
  };
}
