import type { InteractionLogDto, InteractionLogPageDto, InteractionLogQuery } from "@living-network/contracts";

export type InteractionLogInput = Omit<InteractionLogDto, "id" | "createdAt"> & { id?: string; createdAt?: string };

export interface InteractionLogRepository {
  append(input: InteractionLogInput): Promise<InteractionLogDto>;
  query(query?: InteractionLogQuery): Promise<InteractionLogPageDto>;
  deleteOlderThan(cutoff: Date): Promise<number>;
}
