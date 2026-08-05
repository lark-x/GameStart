import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionKind,
  CharacterRole,
  EventRecurrenceKind,
  MomentVisibility,
  StoryMode,
  TriggerSource,
  createActorSession,
  createCharacter,
  createEventExecution,
  createRelationshipEdge,
  createScheduledOccurrence,
  createStoryWorld,
  createWorldEventDefinition,
} from "../packages/domain/src/index.ts";
import { createInMemoryRepositories } from "../packages/database/src/index.ts";
import { ApiApplication } from "../apps/api/src/index.ts";
import {
  FakeComfyUiClient,
  createBehaviorMediaCoordinator,
  createMomentPublicationCoordinator,
} from "../apps/worker/src/index.ts";

const world = createStoryWorld({
  id: "mvp-world",
  name: "MVP World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const firstUser = createCharacter({
  id: "mvp-user-first",
  displayName: "First User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const secondUser = createCharacter({
  id: "mvp-user-second",
  displayName: "Second User",
  role: CharacterRole.USER,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const actor = createCharacter({
  id: "mvp-ai-actor",
  displayName: "Iris",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const edge = createRelationshipEdge({
  id: "mvp-edge",
  source: secondUser,
  target: actor,
  storyWorld: world,
  relationshipType: "friend",
  initialState: { affinity: 42, trust: 35, conflict: 0, dependency: 5 },
  isPublic: true,
  isBidirectional: true,
});
const session = createActorSession({
  id: "mvp-session",
  storyWorld: world,
  userCharacter: firstUser,
  startedAt: "2026-08-05T18:00:00.000Z",
});
const definition = createWorldEventDefinition({
  id: "mvp-event-definition",
  storyWorld: world,
  eventKey: "mvp:observatory",
  name: "Observatory event",
  triggerSource: TriggerSource.MANUAL,
  recurrence: { kind: EventRecurrenceKind.ONCE, runAt: "2026-08-06T10:00:00.000Z" },
  targetCharacters: [actor],
  createdAt: "2026-08-05T18:00:00.000Z",
});
const occurrence = createScheduledOccurrence({
  id: "mvp-occurrence",
  definition,
  scheduledFor: "2026-08-06T10:00:00.000Z",
  occurrenceKey: "mvp:observatory:once",
  createdAt: "2026-08-05T18:00:00.000Z",
});
const execution = createEventExecution({
  id: "mvp-execution",
  occurrence,
  definition,
  ruleVersion: "rules-v1",
  inputSnapshot: { trigger: "manual" },
  startedAt: "2026-08-06T10:00:01.000Z",
});

function makeRepositories() {
  return createInMemoryRepositories({
    worlds: [world],
    characters: [firstUser, secondUser, actor],
    relationshipEdges: [edge],
    actorSessions: [session],
    worldEventDefinitions: [definition],
    scheduledOccurrences: [occurrence],
    eventExecutions: [execution],
  });
}

async function json(response: Response): Promise<any> {
  return response.json();
}

test("runs the MVP event-to-image-to-feed loop with role switching and replay", async () => {
  const repositories = makeRepositories();
  const api = new ApiApplication(repositories);
  const switched = await api.handle(new Request("http://localhost/v1/actor-sessions/switch", {
    method: "POST",
    body: JSON.stringify({ actorSessionId: session.id, nextCharacterId: secondUser.id }),
  }));
  assert.equal(switched.status, 200);
  assert.equal((await repositories.actorSessions.getById(session.id))?.userCharacterId, secondUser.id);

  const media = createBehaviorMediaCoordinator(
    repositories,
    new FakeComfyUiClient(),
    () => new Date("2026-08-06T10:00:02.000Z"),
  );
  const actionInput = {
    id: "mvp-action",
    executionId: execution.id,
    actorCharacterId: actor.id,
    kind: ActionKind.CREATE_MOMENT,
    momentVisibility: MomentVisibility.PUBLIC,
    payload: {
      body: "The observatory dome caught the first light.",
      imagePrompt: "astronomer beneath a glass dome at dawn",
      workflowVersion: "moment@v1",
    },
  } as const;
  const action = await media.planAction(actionInput);
  const replayedAction = await media.planAction(actionInput);
  assert.deepEqual(replayedAction, action);
  const job = await repositories.imageJobs.getByActionId(action.id);
  assert.ok(job);
  const submitted = await media.submitImageJob(job.id);
  const completed = await media.completeImageJob(job.id);
  assert.equal(submitted.status, "SUBMITTED");
  assert.equal(completed.status, "SUCCEEDED");

  const draft = await repositories.momentDrafts.getByActionId(action.id);
  assert.ok(draft);
  assert.equal(draft.status, "READY");
  const publication = createMomentPublicationCoordinator(repositories);
  const moment = await publication.publish({
    id: "mvp-moment",
    draftId: draft.id,
    publishedAt: "2026-08-06T10:01:00.000Z",
  });
  const replayedMoment = await publication.publish({
    id: "mvp-moment",
    draftId: draft.id,
    publishedAt: "2026-08-06T11:00:00.000Z",
  });
  assert.deepEqual(replayedMoment, moment);

  const feed = await api.handle(new Request(
    `http://localhost/v1/moments?storyWorldId=${world.id}&readerCharacterId=${secondUser.id}&limit=10`,
  ));
  assert.equal(feed.status, 200);
  assert.deepEqual((await json(feed)).data.map((item: { id: string }) => item.id), [moment.id]);
  const jobResponse = await api.handle(new Request(`http://localhost/v1/image-jobs/${job.id}`));
  assert.equal(jobResponse.status, 200);
  assert.equal((await json(jobResponse)).data.status, "SUCCEEDED");
  assert.deepEqual((await repositories.relationshipEdges.getById(edge.id))?.initialState, edge.initialState);
});
