import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterRole,
  StoryMode,
  createCharacter,
  createCharacterVisualIdentity,
  createImageWorkflowTemplate,
  createStoryWorld,
} from "@living-network/domain";
import { createInMemoryRepositories } from "./index.ts";

const world = createStoryWorld({
  id: "visual-db-world",
  name: "Visual DB World",
  timezone: "Asia/Shanghai",
  storyMode: StoryMode.STATIC,
  relationshipDynamicsEnabled: false,
});
const character = createCharacter({
  id: "visual-db-character",
  displayName: "Mira",
  role: CharacterRole.AI,
  storyWorldId: world.id,
  timezone: world.timezone,
});
const identity = createCharacterVisualIdentity({
  id: "visual-db-identity",
  characterId: character.id,
  storyWorldId: world.id,
  positivePrompt: "violet-eyed archivist",
  styleTags: ["anime illustration"],
  referenceImageRefs: ["media://mira/reference.png"],
  updatedAt: "2026-08-05T12:00:00.000Z",
});
const template = createImageWorkflowTemplate({
  id: "visual-db-template",
  version: "1",
  workflow: { node: { inputs: { text: "placeholder" } } },
  positivePromptPath: ["node", "inputs", "text"],
});

test("stores visual identities and workflow templates with defensive copies", async () => {
  const repositories = createInMemoryRepositories({
    worlds: [world],
    characters: [character],
    characterVisualIdentities: [identity],
    imageWorkflowTemplates: [template],
  });
  assert.ok(repositories.characterVisualIdentities);
  assert.ok(repositories.imageWorkflowTemplates);
  assert.deepEqual(await repositories.characterVisualIdentities.getByCharacterId(character.id), identity);
  assert.deepEqual(await repositories.imageWorkflowTemplates.getById(template.id, template.version), template);
  const loaded = await repositories.imageWorkflowTemplates.getById(template.id, template.version);
  assert.ok(loaded);
  (loaded.workflow.node as { inputs: { text: string } }).inputs.text = "mutated";
  assert.equal(
    ((await repositories.imageWorkflowTemplates.getById(template.id, template.version))?.workflow.node as {
      inputs: { text: string };
    }).inputs.text,
    "placeholder",
  );
});

test("enforces one visual identity per character and validates world references", async () => {
  const repositories = createInMemoryRepositories({ worlds: [world], characters: [character] });
  assert.ok(repositories.characterVisualIdentities);
  await repositories.characterVisualIdentities.save(identity);
  await assert.rejects(
    repositories.characterVisualIdentities.save({ ...identity, id: "visual-db-identity-2" }),
    { name: "TypeError", message: /Duplicate visual identity character/ },
  );
  await assert.rejects(
    repositories.characterVisualIdentities.save({
      ...identity,
      id: "visual-db-identity-3",
      characterId: "missing-character",
    }),
    { name: "TypeError", message: /invalid character or world/ },
  );
});
