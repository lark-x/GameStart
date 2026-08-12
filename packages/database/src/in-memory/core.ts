import {
  CharacterRole,
  type StoryWorld,
  type Character,
  type RelationshipEdge,
  type ActorSession,
} from "@living-network/domain";
import type {
  StoryWorldRepository,
  CharacterRepository,
  RelationshipEdgeRepository,
  ActorSessionRepository,
} from "../repositories.ts";

function copyWorld(world: StoryWorld): StoryWorld {
  return { ...world };
}

function copyCharacter(character: Character): Character {
  return { ...character };
}

function copyEdge(edge: RelationshipEdge): RelationshipEdge {
  return { ...edge, initialState: { ...edge.initialState } };
}

function copySession(session: ActorSession): ActorSession {
  return { ...session };
}

export function createStoryWorldRepo(
  map: Map<string, StoryWorld>,
): StoryWorldRepository {
  return {
    list: async () => [...map.values()].map(copyWorld),
    getById: async (id) => {
      const world = map.get(id);
      return world ? copyWorld(world) : undefined;
    },
    save: async (world) => {
      map.set(world.id, copyWorld(world));
    },
  };
}

export function createCharacterRepo(
  map: Map<string, Character>,
): CharacterRepository {
  return {
    listByStoryWorld: async (storyWorldId) =>
      [...map.values()]
        .filter(
          (character) =>
            storyWorldId === undefined || character.storyWorldId === storyWorldId,
        )
        .map(copyCharacter),
    getById: async (id) => {
      const character = map.get(id);
      return character ? copyCharacter(character) : undefined;
    },
    save: async (character) => {
      map.set(character.id, copyCharacter(character));
    },
  };
}

export function createRelationshipEdgeRepo(
  map: Map<string, RelationshipEdge>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): RelationshipEdgeRepository {
  return {
    listByStoryWorld: async (storyWorldId) =>
      [...map.values()]
        .filter((edge) => edge.storyWorldId === storyWorldId)
        .map(copyEdge),
    getById: async (id) => {
      const edge = map.get(id);
      return edge ? copyEdge(edge) : undefined;
    },
    save: async (edge) => {
      const source = characterMap.get(edge.sourceCharacterId);
      const target = characterMap.get(edge.targetCharacterId);
      if (!worldMap.has(edge.storyWorldId) || !source || !target) {
        throw new TypeError(`Relationship edge ${edge.id} references an unknown entity`);
      }
      if (
        source.storyWorldId !== edge.storyWorldId ||
        target.storyWorldId !== edge.storyWorldId ||
        source.id === target.id
      ) {
        throw new TypeError(`Relationship edge ${edge.id} has invalid character references`);
      }
      map.set(edge.id, copyEdge(edge));
    },
  };
}

export function createActorSessionRepo(
  map: Map<string, ActorSession>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
): ActorSessionRepository {
  return {
    getById: async (id) => {
      const session = map.get(id);
      return session ? copySession(session) : undefined;
    },
    save: async (session) => {
      const userCharacter = characterMap.get(session.userCharacterId);
      if (
        !worldMap.has(session.storyWorldId) ||
        !userCharacter ||
        userCharacter.role !== CharacterRole.USER ||
        userCharacter.storyWorldId !== session.storyWorldId
      ) {
        throw new TypeError(`Actor session ${session.id} references an invalid user character`);
      }
      map.set(session.id, copySession(session));
    },
  };
}
