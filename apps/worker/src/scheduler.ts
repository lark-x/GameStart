import {
  annualOccurrenceKey,
  createScheduledOccurrence,
  EventRecurrenceKind,
  type ScheduledOccurrence,
  type WorldEventDefinition,
} from "@living-network/domain";
import { assertIsoTimestamp, assertTimezone } from "@living-network/domain";
import type {
  DomainRepositories,
  ScheduledOccurrenceRepository,
  WorldEventDefinitionRepository,
} from "@living-network/database";

export interface ScheduleWindow {
  from: string;
  to: string;
}

export interface ScheduleMaterializationResult {
  inserted: readonly ScheduledOccurrence[];
  existing: readonly ScheduledOccurrence[];
}

export type SchedulerRepositories = DomainRepositories & {
  readonly worldEventDefinitions: WorldEventDefinitionRepository;
  readonly scheduledOccurrences: ScheduledOccurrenceRepository;
};

export type SchedulerClock = () => Date;

function requireSchedulerRepositories(
  repositories: DomainRepositories,
): SchedulerRepositories {
  if (!repositories.worldEventDefinitions || !repositories.scheduledOccurrences) {
    throw new TypeError("Event scheduler repositories are not configured");
  }
  return repositories as SchedulerRepositories;
}

function assertWindow(window: ScheduleWindow): void {
  assertIsoTimestamp(window.from, "scheduleWindow.from");
  assertIsoTimestamp(window.to, "scheduleWindow.to");
  if (Date.parse(window.from) >= Date.parse(window.to)) {
    throw new RangeError("scheduleWindow.from must be before scheduleWindow.to");
  }
}

function padded(value: number): string {
  return String(value).padStart(2, "0");
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date, timezone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    calendar: "gregory",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = new Map<string, string>(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const value = (name: string): number => {
    const raw = parts.get(name);
    if (raw === undefined) throw new Error(`timezone formatter omitted ${name}`);
    return Number(raw);
  };
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/**
 * Converts a Gregorian local wall-clock time to UTC without adding a date
 * library. The fixed-point correction handles ordinary DST offsets; a later
 * calendar adapter can define an explicit policy for ambiguous/nonexistent
 * DST wall-clock times.
 */
export function localDateTimeToUtc(
  localDateTime: string,
  timezone: string,
): string {
  assertTimezone(timezone, "timezone");
  const target = Date.parse(`${localDateTime}Z`);
  if (Number.isNaN(target)) throw new TypeError("localDateTime must be valid ISO local time");

  let guess = target;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const localized = zonedParts(new Date(guess), timezone);
    const localizedAsUtc = Date.UTC(
      localized.year,
      localized.month - 1,
      localized.day,
      localized.hour,
      localized.minute,
      localized.second,
    );
    const next = target - (localizedAsUtc - guess);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}

function localYear(date: string, timezone: string): number {
  return zonedParts(new Date(date), timezone).year;
}

function isValidAnnualDate(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;
}

function candidateForYear(
  definition: WorldEventDefinition,
  year: number,
): { scheduledFor: string; occurrenceKey: string } | undefined {
  if (definition.recurrence.kind !== EventRecurrenceKind.ANNUAL) return undefined;
  const { month, day, localTime } = definition.recurrence;
  if (!isValidAnnualDate(year, month, day)) return undefined;
  const localDateTime = `${year}-${padded(month)}-${padded(day)}T${localTime}:00`;
  return {
    scheduledFor: localDateTimeToUtc(localDateTime, definition.timezone),
    occurrenceKey: annualOccurrenceKey(definition, year),
  };
}

function candidateForOnce(
  definition: WorldEventDefinition,
): { scheduledFor: string; occurrenceKey: string } | undefined {
  if (definition.recurrence.kind !== EventRecurrenceKind.ONCE) return undefined;
  return {
    scheduledFor: definition.recurrence.runAt,
    occurrenceKey: `${definition.id}:${definition.recurrence.runAt}`,
  };
}

function occurrenceId(occurrenceKey: string): string {
  return `occurrence:${occurrenceKey}`;
}

export class EventScheduler {
  private readonly repositories: SchedulerRepositories;
  private readonly clock: SchedulerClock;

  public constructor(
    repositories: DomainRepositories,
    clock: SchedulerClock = () => new Date(),
  ) {
    this.repositories = requireSchedulerRepositories(repositories);
    this.clock = clock;
  }

  public async materialize(
    storyWorldId: string,
    window: ScheduleWindow,
  ): Promise<ScheduleMaterializationResult> {
    assertWindow(window);
    const createdAt = this.clock().toISOString();
    assertIsoTimestamp(createdAt, "scheduler.clock");
    const definitions = await this.repositories.worldEventDefinitions.listByStoryWorld(
      storyWorldId,
    );
    const inserted: ScheduledOccurrence[] = [];
    const existing: ScheduledOccurrence[] = [];

    for (const definition of definitions) {
      if (!definition.enabled) continue;
      const candidates: Array<{ scheduledFor: string; occurrenceKey: string }> = [];
      const once = candidateForOnce(definition);
      if (once) candidates.push(once);
      if (definition.recurrence.kind === EventRecurrenceKind.ANNUAL) {
        const firstYear = localYear(window.from, definition.timezone);
        const lastYear = localYear(window.to, definition.timezone);
        for (let year = firstYear; year <= lastYear; year += 1) {
          const annual = candidateForYear(definition, year);
          if (annual) candidates.push(annual);
        }
      }

      for (const candidate of candidates) {
        const scheduledAt = Date.parse(candidate.scheduledFor);
        if (
          Number.isNaN(scheduledAt) ||
          scheduledAt < Date.parse(window.from) ||
          scheduledAt >= Date.parse(window.to)
        ) {
          continue;
        }
        const occurrence = createScheduledOccurrence({
          id: occurrenceId(candidate.occurrenceKey),
          definition,
          scheduledFor: candidate.scheduledFor,
          occurrenceKey: candidate.occurrenceKey,
          createdAt,
        });
        const result = await this.repositories.scheduledOccurrences.save(occurrence);
        (result.inserted ? inserted : existing).push(result.occurrence);
      }
    }

    return { inserted, existing };
  }
}

export function createEventScheduler(
  repositories: DomainRepositories,
  clock?: SchedulerClock,
): EventScheduler {
  return new EventScheduler(repositories, clock);
}
