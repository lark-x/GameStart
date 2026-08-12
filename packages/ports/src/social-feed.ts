import type { SocialFeedEvent, SocialFeedEventInput } from "@living-network/domain";

export interface SocialFeedEventRepository {
  getById(id: string): Promise<SocialFeedEvent | undefined>;
  listByStoryWorld(storyWorldId: string, cursor?: number, limit?: number): Promise<readonly SocialFeedEvent[]>;
  save(event: SocialFeedEventInput): Promise<void>;
}
