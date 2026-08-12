import type { SocialFeedEvent, SocialFeedEventInput } from "@living-network/domain";
import type { SocialFeedEventRepository } from "@living-network/ports";

function copyEvent(event: SocialFeedEvent): SocialFeedEvent {
  return { ...event };
}

export function createSocialFeedEventRepo(
  map: Map<string, SocialFeedEvent>,
): SocialFeedEventRepository {
  let nextCursor = 1;
  return {
    getById: async (id) => {
      const event = map.get(id);
      return event ? copyEvent(event) : undefined;
    },
    listByStoryWorld: async (storyWorldId, cursor, limit = 50) => {
      return [...map.values()]
        .filter((event) => event.storyWorldId === storyWorldId && (!cursor || event.cursorValue > cursor))
        .sort((a, b) => a.cursorValue - b.cursorValue)
        .slice(0, limit)
        .map(copyEvent);
    },
    save: async (event) => {
      const eventWithCursor = { ...event, cursorValue: nextCursor++ };
      map.set(event.id, copyEvent(eventWithCursor));
    },
  };
}
