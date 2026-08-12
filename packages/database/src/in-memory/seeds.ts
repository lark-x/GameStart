import {
  CharacterRole,
  assertAppearanceSettings,
  assertComfyUiSettings,
  assertLlmProviderProfile,
  assertBehaviorAction,
  assertCharacterPlan,
  assertEventExecution,
  assertImageJob,
  assertCharacterVisualIdentity,
  assertImageWorkflowTemplate,
  assertSticker,
  assertStickerPack,
  assertMoment,
  assertMomentInteraction,
  assertMomentDraft,
  assertProactiveMessageBudget,
  assertScheduledOccurrence,
  assertWorldEventDefinition,
  assertWorldLoreEntry,
  type ActorSession,
  type AppearanceSettings,
  type ComfyUiSettings,
  type LlmProviderProfile,
  type BehaviorAction,
  type CharacterPlan,
  type Character,
  type ConversationAggregate,
  type EventExecution,
  type ImageJob,
  type CharacterVisualIdentity,
  type ImageWorkflowTemplate,
  type Sticker,
  type StickerPack,
  type JsonObject,
  type Message,
  type MemoryItem,
  type ProactiveMessageBudget,
  type MomentDraft,
  type Moment,
  type MomentInteraction,
  type RelationshipEdge,
  type ScheduledOccurrence,
  type StoryWorld,
  type StoryArc,
  type StoryNode,
  type StoryEdge,
  type PromptTemplate,
  type MemoryCandidate,
  type WorldEventDefinition,
  type WorldLoreEntry,
  type WorldContextPolicy,
  type StoryGenerationJob,
  type StoryGenerationCandidate,
} from "@living-network/domain";

// ── Copy helpers ──

export function copyWorld(world: StoryWorld): StoryWorld {
  return { ...world };
}

export function copyCharacter(character: Character): Character {
  return { ...character };
}

export function copySession(session: ActorSession): ActorSession {
  return { ...session };
}

export function copyEdge(edge: RelationshipEdge): RelationshipEdge {
  return { ...edge, initialState: { ...edge.initialState } };
}

export function copyConversation(aggregate: ConversationAggregate): ConversationAggregate {
  return {
    conversation: { ...aggregate.conversation },
    members: aggregate.members.map((member) => ({ ...member })),
  };
}

export function copyMessage(message: Message): Message {
  return { ...message };
}

export function copyMemory(memory: MemoryItem): MemoryItem {
  return {
    ...memory,
    audienceCharacterIds: [...memory.audienceCharacterIds],
  };
}

export function copyEventDefinition(definition: WorldEventDefinition): WorldEventDefinition {
  return {
    ...definition,
    recurrence: definition.recurrence.kind === "ONCE"
      ? { ...definition.recurrence }
      : { ...definition.recurrence },
    targetCharacterIds: [...definition.targetCharacterIds],
    recipientCharacterIds: [...definition.recipientCharacterIds],
    outputs: { ...definition.outputs },
  };
}

export function copyOccurrence(occurrence: ScheduledOccurrence): ScheduledOccurrence {
  return { ...occurrence };
}

export function copyPlan(plan: CharacterPlan): CharacterPlan {
  return { ...plan };
}

export function copyBudget(budget: ProactiveMessageBudget): ProactiveMessageBudget {
  return { ...budget };
}

export function copyJsonObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

export function copyExecution(execution: EventExecution): EventExecution {
  return {
    ...execution,
    targetCharacterIds: [...execution.targetCharacterIds],
    inputSnapshot: copyJsonObject(execution.inputSnapshot),
    ...(execution.outputSnapshot === undefined
      ? {}
      : { outputSnapshot: copyJsonObject(execution.outputSnapshot) }),
  };
}

export function copyAction(action: BehaviorAction): BehaviorAction {
  return {
    ...action,
    payload: copyJsonObject(action.payload),
  };
}

export function copyMomentDraft(draft: MomentDraft): MomentDraft {
  return { ...draft };
}

export function copyImageJob(job: ImageJob): ImageJob {
  return { ...job };
}

export function copyCharacterVisualIdentity(identity: CharacterVisualIdentity): CharacterVisualIdentity {
  return {
    ...identity,
    styleTags: [...identity.styleTags],
    referenceImageRefs: [...identity.referenceImageRefs],
  };
}

export function copyImageWorkflowTemplate(template: ImageWorkflowTemplate): ImageWorkflowTemplate {
  return {
    ...template,
    workflow: copyJsonObject(template.workflow),
    positivePromptPath: [...template.positivePromptPath],
    ...(template.negativePromptPath === undefined
      ? {}
      : { negativePromptPath: [...template.negativePromptPath] }),
    ...(template.seedPath === undefined ? {} : { seedPath: [...template.seedPath] }),
  };
}

export function copyStickerPack(pack: StickerPack): StickerPack {
  return { ...pack };
}

export function copySticker(sticker: Sticker): Sticker {
  return { ...sticker, tags: [...sticker.tags] };
}

export function copyMoment(moment: Moment): Moment {
  return {
    ...moment,
    audienceCharacterIds: [...moment.audienceCharacterIds],
  };
}

export function copyMomentInteraction(interaction: MomentInteraction): MomentInteraction {
  return { ...interaction };
}

export function copyAppearanceSettings(settings: AppearanceSettings): AppearanceSettings {
  const chatBackground = { ...settings.chatBackground };
  if (settings.chatBackground.items !== undefined) {
    chatBackground.items = settings.chatBackground.items.map((item) => ({ ...item }));
  }
  return { ...settings, chatBackground };
}

export function copyLlmProviderProfile(profile: LlmProviderProfile): LlmProviderProfile {
  return { ...profile };
}

export function copyComfyUiSettings(settings: ComfyUiSettings): ComfyUiSettings {
  return { ...settings };
}

export function copyWorldLoreEntry(entry: WorldLoreEntry): WorldLoreEntry {
  return { ...entry, tags: [...entry.tags] };
}

export function copyStoryArc(arc: StoryArc): StoryArc {
  return { ...arc };
}

export function copyStoryNode(node: StoryNode): StoryNode {
  return {
    ...node,
    requiredFacts: [...node.requiredFacts],
    involvedCharacterIds: [...node.involvedCharacterIds],
    referencedMemoryIds: [...node.referencedMemoryIds],
  };
}

export function copyStoryEdge(edge: StoryEdge): StoryEdge {
  return { ...edge };
}

export function copyPromptTemplate(template: PromptTemplate): PromptTemplate {
  return { ...template };
}

export function copyMemoryCandidate(candidate: MemoryCandidate): MemoryCandidate {
  return { ...candidate };
}

// ── Shared utilities ──

export function addUnique<T extends { id: string }>(
  target: Map<string, T>,
  value: T,
  kind: string,
): void {
  if (target.has(value.id)) {
    throw new TypeError(`Duplicate ${kind} id: ${value.id}`);
  }
  target.set(value.id, value);
}

// ── Reference assertion helpers ──

export function assertEdgeReferences(
  edge: RelationshipEdge,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  const source = characters.get(edge.sourceCharacterId);
  const target = characters.get(edge.targetCharacterId);
  if (!worlds.has(edge.storyWorldId) || !source || !target) {
    throw new TypeError(`Relationship edge ${edge.id} references an unknown entity`);
  }
  if (
    source.storyWorldId !== edge.storyWorldId ||
    target.storyWorldId !== edge.storyWorldId ||
    source.id === target.id
  ) {
    throw new TypeError(`Relationship edge ${edge.id} has invalid character references`);
  }
}

export function assertVisualIdentityReferences(
  identity: CharacterVisualIdentity,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertCharacterVisualIdentity(identity);
  const world = worlds.get(identity.storyWorldId);
  const character = characters.get(identity.characterId);
  if (!world || !character || character.storyWorldId !== identity.storyWorldId) {
    throw new TypeError(`Visual identity ${identity.id} references invalid character or world`);
  }
}

export function assertSessionReferences(
  session: ActorSession,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  const userCharacter = characters.get(session.userCharacterId);
  if (
    !worlds.has(session.storyWorldId) ||
    !userCharacter ||
    userCharacter.role !== CharacterRole.USER ||
    userCharacter.storyWorldId !== session.storyWorldId
  ) {
    throw new TypeError(`Actor session ${session.id} references an invalid user character`);
  }
}

export function assertConversationReferences(
  aggregate: ConversationAggregate,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  if (!worlds.has(aggregate.conversation.storyWorldId)) {
    throw new TypeError(
      `Conversation ${aggregate.conversation.id} references an unknown story world`,
    );
  }
  const ids = new Set<string>();
  for (const member of aggregate.members) {
    if (member.conversationId !== aggregate.conversation.id || ids.has(member.characterId)) {
      throw new TypeError(`Conversation ${aggregate.conversation.id} has invalid members`);
    }
    const character = characters.get(member.characterId);
    if (!character || character.storyWorldId !== aggregate.conversation.storyWorldId) {
      throw new TypeError(`Conversation ${aggregate.conversation.id} has an invalid member`);
    }
    ids.add(member.characterId);
  }
}

export function assertMemoryReferences(
  memory: MemoryItem,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  if (!worlds.has(memory.storyWorldId)) {
    throw new TypeError(`Memory ${memory.id} references an unknown story world`);
  }
  const ids = [
    ...(memory.subjectCharacterId === undefined ? [] : [memory.subjectCharacterId]),
    ...memory.audienceCharacterIds,
  ];
  for (const id of ids) {
    const character = characters.get(id);
    if (!character || character.storyWorldId !== memory.storyWorldId) {
      throw new TypeError(`Memory ${memory.id} references an invalid character`);
    }
  }
}

export function assertEventDefinitionReferences(
  definition: WorldEventDefinition,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertWorldEventDefinition(definition);
  if (!worlds.has(definition.storyWorldId)) {
    throw new TypeError(
      `Event definition ${definition.id} references an unknown story world`,
    );
  }
  for (const characterId of definition.targetCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== definition.storyWorldId) {
      throw new TypeError(
        `Event definition ${definition.id} references an invalid target character`,
      );
    }
  }
  for (const characterId of definition.recipientCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== definition.storyWorldId) {
      throw new TypeError(
        `Event definition ${definition.id} references an invalid recipient character`,
      );
    }
  }
}

export function assertPlanReferences(
  plan: CharacterPlan,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertCharacterPlan(plan);
  const character = characters.get(plan.characterId);
  if (!worlds.has(plan.storyWorldId) || !character || character.storyWorldId !== plan.storyWorldId) {
    throw new TypeError(`Character plan ${plan.id} references an invalid character or world`);
  }
}

export function assertBudgetReferences(
  budget: ProactiveMessageBudget,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertProactiveMessageBudget(budget);
  const character = characters.get(budget.characterId);
  if (!worlds.has(budget.storyWorldId) || !character || character.storyWorldId !== budget.storyWorldId) {
    throw new TypeError(`Message budget ${budget.id} references an invalid character or world`);
  }
}

export function assertExecutionReferences(
  execution: EventExecution,
  definitions: Map<string, WorldEventDefinition>,
  occurrences: Map<string, ScheduledOccurrence>,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertEventExecution(execution);
  const definition = definitions.get(execution.definitionId);
  const occurrence = occurrences.get(execution.occurrenceId);
  if (
    !worlds.has(execution.storyWorldId) ||
    !definition ||
    !occurrence ||
    definition.storyWorldId !== execution.storyWorldId ||
    occurrence.storyWorldId !== execution.storyWorldId ||
    occurrence.definitionId !== execution.definitionId ||
    occurrence.eventKey !== execution.eventKey
  ) {
    throw new TypeError(`Event execution ${execution.id} references invalid event state`);
  }
  for (const characterId of execution.targetCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== execution.storyWorldId) {
      throw new TypeError(`Event execution ${execution.id} references an invalid target character`);
    }
  }
}

export function assertActionReferences(
  action: BehaviorAction,
  executions: Map<string, EventExecution>,
  characters: Map<string, Character>,
): void {
  assertBehaviorAction(action);
  const execution = executions.get(action.executionId);
  const actor = characters.get(action.actorCharacterId);
  if (
    !execution ||
    execution.storyWorldId !== action.storyWorldId ||
    !actor ||
    actor.storyWorldId !== action.storyWorldId ||
    !execution.targetCharacterIds.includes(action.actorCharacterId)
  ) {
    throw new TypeError(`Behavior action ${action.id} references invalid execution or actor`);
  }
}

export function assertMomentDraftReferences(
  draft: MomentDraft,
  actions: Map<string, BehaviorAction>,
  executions: Map<string, EventExecution>,
  characters: Map<string, Character>,
): void {
  assertMomentDraft(draft);
  const action = actions.get(draft.actionId);
  const execution = executions.get(draft.executionId);
  const author = characters.get(draft.authorCharacterId);
  if (
    !action ||
    action.kind !== "CREATE_MOMENT" ||
    action.executionId !== draft.executionId ||
    !execution ||
    !author ||
    author.storyWorldId !== draft.storyWorldId ||
    action.actorCharacterId !== draft.authorCharacterId
  ) {
    throw new TypeError(`Moment draft ${draft.id} references invalid action or author`);
  }
}

export function assertImageReferences(
  job: ImageJob,
  actions: Map<string, BehaviorAction>,
  executions: Map<string, EventExecution>,
  characters: Map<string, Character>,
  drafts: Map<string, MomentDraft>,
): void {
  assertImageJob(job);
  const action = actions.get(job.actionId);
  const execution = executions.get(job.executionId);
  const owner = characters.get(job.ownerCharacterId);
  if (
    !action ||
    (action.kind !== "REQUEST_IMAGE" && action.kind !== "CREATE_MOMENT") ||
    action.executionId !== job.executionId ||
    !execution ||
    !owner ||
    owner.storyWorldId !== job.storyWorldId ||
    action.actorCharacterId !== job.ownerCharacterId
  ) {
    throw new TypeError(`Image job ${job.id} references invalid action or owner`);
  }
  if (job.momentDraftId !== undefined) {
    const draft = drafts.get(job.momentDraftId);
    if (!draft || draft.actionId !== job.actionId) {
      throw new TypeError(`Image job ${job.id} references invalid moment draft`);
    }
  }
}

export function assertMomentReferences(
  moment: Moment,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
): void {
  assertMoment(moment);
  const author = characters.get(moment.authorCharacterId);
  if (!worlds.has(moment.storyWorldId) || !author || author.storyWorldId !== moment.storyWorldId) {
    throw new TypeError(`Moment ${moment.id} references an invalid author or world`);
  }
  for (const characterId of moment.audienceCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== moment.storyWorldId) {
      throw new TypeError(`Moment ${moment.id} references an invalid audience character`);
    }
  }
}

export function assertMomentInteractionReferences(
  interaction: MomentInteraction,
  moments: Map<string, Moment>,
  characters: Map<string, Character>,
): void {
  assertMomentInteraction(interaction);
  const moment = moments.get(interaction.momentId);
  const actor = characters.get(interaction.actorCharacterId);
  if (
    !moment ||
    !actor ||
    actor.storyWorldId !== interaction.storyWorldId ||
    moment.storyWorldId !== interaction.storyWorldId
  ) {
    throw new TypeError(`Moment interaction ${interaction.id} references invalid moment or actor`);
  }
}

export function assertWorldLoreEntryReferences(
  entry: WorldLoreEntry,
  worlds: Map<string, StoryWorld>,
): void {
  assertWorldLoreEntry(entry);
  if (!worlds.has(entry.storyWorldId)) {
    throw new TypeError(`World lore entry ${entry.id} references an unknown story world`);
  }
}

export function assertStoryArcReferences(arc: StoryArc, worlds: Map<string, StoryWorld>): void {
  if (!worlds.has(arc.storyWorldId)) {
    throw new TypeError(`Story arc ${arc.id} references an unknown story world`);
  }
}

export function assertStoryNodeReferences(
  node: StoryNode,
  worlds: Map<string, StoryWorld>,
  arcs: Map<string, StoryArc>,
  characters: Map<string, Character>,
  memories: Map<string, MemoryItem>,
): void {
  if (!worlds.has(node.storyWorldId)) {
    throw new TypeError(`Story node ${node.id} references an unknown story world`);
  }
  const arc = arcs.get(node.arcId);
  if (!arc || arc.storyWorldId !== node.storyWorldId) {
    throw new TypeError(`Story node ${node.id} references an invalid story arc`);
  }
  for (const characterId of node.involvedCharacterIds) {
    const character = characters.get(characterId);
    if (!character || character.storyWorldId !== node.storyWorldId) {
      throw new TypeError(`Story node ${node.id} references an invalid character`);
    }
  }
  for (const memoryId of node.referencedMemoryIds) {
    const memory = memories.get(memoryId);
    if (!memory || memory.storyWorldId !== node.storyWorldId) {
      throw new TypeError(`Story node ${node.id} references an invalid memory`);
    }
  }
}

export function assertStoryEdgeReferences(
  edge: StoryEdge,
  worlds: Map<string, StoryWorld>,
  arcs: Map<string, StoryArc>,
  nodes: Map<string, StoryNode>,
): void {
  if (!worlds.has(edge.storyWorldId)) {
    throw new TypeError(`Story edge ${edge.id} references an unknown story world`);
  }
  const arc = arcs.get(edge.arcId);
  const fromNode = nodes.get(edge.fromNodeId);
  const toNode = nodes.get(edge.toNodeId);
  if (
    !arc ||
    arc.storyWorldId !== edge.storyWorldId ||
    !fromNode ||
    !toNode ||
    fromNode.storyWorldId !== edge.storyWorldId ||
    toNode.storyWorldId !== edge.storyWorldId ||
    fromNode.arcId !== edge.arcId ||
    toNode.arcId !== edge.arcId
  ) {
    throw new TypeError(`Story edge ${edge.id} references invalid story nodes`);
  }
}

export function assertPromptTemplateReferences(template: PromptTemplate, worlds: Map<string, StoryWorld>): void {
  if (!worlds.has(template.storyWorldId)) {
    throw new TypeError(`Prompt template ${template.id} references an unknown story world`);
  }
}

export function assertMemoryCandidateReferences(
  candidate: MemoryCandidate,
  worlds: Map<string, StoryWorld>,
  characters: Map<string, Character>,
  memories: Map<string, MemoryItem>,
): void {
  if (!worlds.has(candidate.storyWorldId)) {
    throw new TypeError(`Memory candidate ${candidate.id} references an unknown story world`);
  }
  if (candidate.reviewerCharacterId !== undefined) {
    const character = characters.get(candidate.reviewerCharacterId);
    if (!character || character.storyWorldId !== candidate.storyWorldId) {
      throw new TypeError(`Memory candidate ${candidate.id} references an invalid reviewer`);
    }
  }
  if (candidate.mergedIntoMemoryId !== undefined) {
    const memory = memories.get(candidate.mergedIntoMemoryId);
    if (!memory || memory.storyWorldId !== candidate.storyWorldId) {
      throw new TypeError(`Memory candidate ${candidate.id} references an invalid merged memory`);
    }
  }
}

// ── Seed validation functions ──

export function seedWorlds(
  map: Map<string, StoryWorld>,
  seed: readonly StoryWorld[],
): void {
  for (const world of seed) {
    addUnique(map, copyWorld(world), "storyWorld");
  }
}

export function seedCharacters(
  map: Map<string, Character>,
  worldMap: Map<string, StoryWorld>,
  seed: readonly Character[],
): void {
  for (const character of seed) {
    if (!worldMap.has(character.storyWorldId)) {
      throw new TypeError(
        `Character ${character.id} references unknown story world ${character.storyWorldId}`,
      );
    }
    addUnique(map, copyCharacter(character), "character");
  }
}

export function seedVisualIdentities(
  map: Map<string, CharacterVisualIdentity>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly CharacterVisualIdentity[],
): void {
  for (const identity of seed) {
    assertVisualIdentityReferences(identity, worldMap, characterMap);
    if ([...map.values()].some(
      (candidate) => candidate.characterId === identity.characterId,
    )) {
      throw new TypeError(`Duplicate visual identity character: ${identity.characterId}`);
    }
    addUnique(map, copyCharacterVisualIdentity(identity), "characterVisualIdentity");
  }
}

export function seedImageWorkflowTemplates(
  map: Map<string, ImageWorkflowTemplate>,
  seed: readonly ImageWorkflowTemplate[],
): void {
  for (const template of seed) {
    assertImageWorkflowTemplate(template);
    const key = `${template.id}@${template.version}`;
    if (map.has(key)) {
      throw new TypeError(`Duplicate image workflow template: ${key}`);
    }
    map.set(key, copyImageWorkflowTemplate(template));
  }
}

export function seedStickerPacks(
  map: Map<string, StickerPack>,
  worldMap: Map<string, StoryWorld>,
  seed: readonly StickerPack[],
): void {
  for (const pack of seed) {
    assertStickerPack(pack);
    if (!worldMap.has(pack.storyWorldId)) {
      throw new TypeError(`Sticker pack ${pack.id} references an unknown story world`);
    }
    addUnique(map, copyStickerPack(pack), "stickerPack");
  }
}

export function seedStickers(
  map: Map<string, Sticker>,
  packMap: Map<string, StickerPack>,
  seed: readonly Sticker[],
): void {
  for (const sticker of seed) {
    assertSticker(sticker);
    const pack = packMap.get(sticker.packId);
    if (!pack || pack.storyWorldId !== sticker.storyWorldId) {
      throw new TypeError(`Sticker ${sticker.id} references an invalid pack`);
    }
    addUnique(map, copySticker(sticker), "sticker");
  }
}

export function seedRelationshipEdges(
  map: Map<string, RelationshipEdge>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly RelationshipEdge[],
): void {
  for (const edge of seed) {
    assertEdgeReferences(edge, worldMap, characterMap);
    addUnique(map, copyEdge(edge), "relationshipEdge");
  }
}

export function seedActorSessions(
  map: Map<string, ActorSession>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly ActorSession[],
): void {
  for (const session of seed) {
    assertSessionReferences(session, worldMap, characterMap);
    addUnique(map, copySession(session), "actorSession");
  }
}

export function seedConversations(
  map: Map<string, ConversationAggregate>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly ConversationAggregate[],
): void {
  for (const conversation of seed) {
    assertConversationReferences(conversation, worldMap, characterMap);
    if (map.has(conversation.conversation.id)) {
      throw new TypeError(`Duplicate conversation id: ${conversation.conversation.id}`);
    }
    map.set(conversation.conversation.id, copyConversation(conversation));
  }
}

export function seedMemories(
  map: Map<string, MemoryItem>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly MemoryItem[],
): void {
  for (const memory of seed) {
    assertMemoryReferences(memory, worldMap, characterMap);
    addUnique(map, copyMemory(memory), "memory");
  }
}

export function seedStoryArcs(
  map: Map<string, StoryArc>,
  worldMap: Map<string, StoryWorld>,
  seed: readonly StoryArc[],
): void {
  for (const arc of seed) {
    assertStoryArcReferences(arc, worldMap);
    addUnique(map, copyStoryArc(arc), "storyArc");
  }
}

export function seedStoryNodes(
  map: Map<string, StoryNode>,
  worldMap: Map<string, StoryWorld>,
  arcMap: Map<string, StoryArc>,
  characterMap: Map<string, Character>,
  memoryMap: Map<string, MemoryItem>,
  seed: readonly StoryNode[],
): void {
  for (const node of seed) {
    assertStoryNodeReferences(node, worldMap, arcMap, characterMap, memoryMap);
    addUnique(map, copyStoryNode(node), "storyNode");
  }
}

export function seedStoryEdges(
  map: Map<string, StoryEdge>,
  worldMap: Map<string, StoryWorld>,
  arcMap: Map<string, StoryArc>,
  nodeMap: Map<string, StoryNode>,
  seed: readonly StoryEdge[],
): void {
  for (const edge of seed) {
    assertStoryEdgeReferences(edge, worldMap, arcMap, nodeMap);
    addUnique(map, copyStoryEdge(edge), "storyEdge");
  }
}

export function seedPromptTemplates(
  map: Map<string, PromptTemplate>,
  worldMap: Map<string, StoryWorld>,
  seed: readonly PromptTemplate[],
): void {
  for (const template of seed) {
    assertPromptTemplateReferences(template, worldMap);
    addUnique(map, copyPromptTemplate(template), "promptTemplate");
  }
}

export function seedMemoryCandidates(
  map: Map<string, MemoryCandidate>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  memoryMap: Map<string, MemoryItem>,
  seed: readonly MemoryCandidate[],
): void {
  for (const candidate of seed) {
    assertMemoryCandidateReferences(candidate, worldMap, characterMap, memoryMap);
    addUnique(map, copyMemoryCandidate(candidate), "memoryCandidate");
  }
}

export function seedWorldEventDefinitions(
  map: Map<string, WorldEventDefinition>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly WorldEventDefinition[],
): void {
  for (const definition of seed) {
    assertEventDefinitionReferences(definition, worldMap, characterMap);
    addUnique(map, copyEventDefinition(definition), "worldEventDefinition");
  }
}

export function seedWorldLoreEntries(
  map: Map<string, WorldLoreEntry>,
  worldMap: Map<string, StoryWorld>,
  seed: readonly WorldLoreEntry[],
): void {
  for (const entry of seed) {
    assertWorldLoreEntryReferences(entry, worldMap);
    addUnique(map, copyWorldLoreEntry(entry), "worldLoreEntry");
  }
}

export function seedScheduledOccurrences(
  map: Map<string, ScheduledOccurrence>,
  definitionMap: Map<string, WorldEventDefinition>,
  seed: readonly ScheduledOccurrence[],
): void {
  for (const occurrence of seed) {
    assertScheduledOccurrence(occurrence);
    const definition = definitionMap.get(occurrence.definitionId);
    if (
      !definition ||
      definition.storyWorldId !== occurrence.storyWorldId ||
      definition.eventKey !== occurrence.eventKey ||
      definition.timezone !== occurrence.timezone
    ) {
      throw new TypeError(
        `Scheduled occurrence ${occurrence.id} references an invalid event definition`,
      );
    }
    if ([...map.values()].some(
      (candidate) =>
        candidate.storyWorldId === occurrence.storyWorldId &&
        candidate.occurrenceKey === occurrence.occurrenceKey,
    )) {
      throw new TypeError(`Duplicate scheduled occurrence key: ${occurrence.occurrenceKey}`);
    }
    addUnique(map, copyOccurrence(occurrence), "scheduledOccurrence");
  }
}

export function seedCharacterPlans(
  map: Map<string, CharacterPlan>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly CharacterPlan[],
): void {
  for (const plan of seed) {
    assertPlanReferences(plan, worldMap, characterMap);
    addUnique(map, copyPlan(plan), "characterPlan");
  }
}

export function seedProactiveMessageBudgets(
  map: Map<string, ProactiveMessageBudget>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly ProactiveMessageBudget[],
): void {
  for (const budget of seed) {
    assertBudgetReferences(budget, worldMap, characterMap);
    addUnique(map, copyBudget(budget), "proactiveMessageBudget");
  }
}

export function seedEventExecutions(
  map: Map<string, EventExecution>,
  definitionMap: Map<string, WorldEventDefinition>,
  occurrenceMap: Map<string, ScheduledOccurrence>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly EventExecution[],
): void {
  for (const execution of seed) {
    assertExecutionReferences(execution, definitionMap, occurrenceMap, worldMap, characterMap);
    if ([...map.values()].some(
      (candidate) =>
        candidate.occurrenceId === execution.occurrenceId &&
        candidate.attempt === execution.attempt,
    )) {
      throw new TypeError(`Duplicate event execution attempt: ${execution.occurrenceId}:${execution.attempt}`);
    }
    addUnique(map, copyExecution(execution), "eventExecution");
  }
}

export function seedBehaviorActions(
  map: Map<string, BehaviorAction>,
  executionMap: Map<string, EventExecution>,
  characterMap: Map<string, Character>,
  seed: readonly BehaviorAction[],
): void {
  for (const action of seed) {
    assertActionReferences(action, executionMap, characterMap);
    addUnique(map, copyAction(action), "behaviorAction");
  }
}

export function seedMomentDrafts(
  map: Map<string, MomentDraft>,
  actionMap: Map<string, BehaviorAction>,
  executionMap: Map<string, EventExecution>,
  characterMap: Map<string, Character>,
  seed: readonly MomentDraft[],
): void {
  for (const draft of seed) {
    assertMomentDraftReferences(draft, actionMap, executionMap, characterMap);
    addUnique(map, copyMomentDraft(draft), "momentDraft");
  }
}

export function seedImageJobs(
  map: Map<string, ImageJob>,
  actionMap: Map<string, BehaviorAction>,
  executionMap: Map<string, EventExecution>,
  characterMap: Map<string, Character>,
  draftMap: Map<string, MomentDraft>,
  seed: readonly ImageJob[],
): void {
  for (const job of seed) {
    assertImageReferences(job, actionMap, executionMap, characterMap, draftMap);
    addUnique(map, copyImageJob(job), "imageJob");
  }
}

export function seedMoments(
  map: Map<string, Moment>,
  worldMap: Map<string, StoryWorld>,
  characterMap: Map<string, Character>,
  seed: readonly Moment[],
): void {
  for (const moment of seed) {
    assertMomentReferences(moment, worldMap, characterMap);
    addUnique(map, copyMoment(moment), "moment");
  }
}

export function seedMomentInteractions(
  map: Map<string, MomentInteraction>,
  momentMap: Map<string, Moment>,
  characterMap: Map<string, Character>,
  seed: readonly MomentInteraction[],
): void {
  for (const interaction of seed) {
    assertMomentInteractionReferences(interaction, momentMap, characterMap);
    const duplicateKey = [...map.values()].some(
      (candidate) =>
        candidate.momentId === interaction.momentId &&
        candidate.idempotencyKey === interaction.idempotencyKey,
    );
    if (duplicateKey) {
      throw new TypeError(`Duplicate moment interaction idempotency key: ${interaction.idempotencyKey}`);
    }
    addUnique(map, copyMomentInteraction(interaction), "momentInteraction");
  }
}

export function seedAppearanceSettings(
  map: Map<string, AppearanceSettings>,
  seed: readonly AppearanceSettings[],
): void {
  for (const settings of seed) {
    assertAppearanceSettings(settings);
    if ([...map.values()].some((candidate) => candidate.ownerKey === settings.ownerKey && candidate.id !== settings.id)) {
      throw new TypeError(`Duplicate appearance settings owner key: ${settings.ownerKey}`);
    }
    addUnique(map, copyAppearanceSettings(settings), "appearanceSettings");
  }
}

export function seedLlmProviderProfiles(
  map: Map<string, LlmProviderProfile>,
  seed: readonly LlmProviderProfile[],
): void {
  for (const profile of seed) {
    assertLlmProviderProfile(profile);
    if (profile.isActive && [...map.values()].some((candidate) => candidate.isActive)) {
      throw new TypeError("Only one LLM provider profile can be active");
    }
    addUnique(map, copyLlmProviderProfile(profile), "llmProviderProfile");
  }
}

export function seedComfyUiSettings(
  map: Map<string, ComfyUiSettings>,
  seed: ComfyUiSettings,
): void {
  assertComfyUiSettings(seed);
  if (seed.id !== "default") throw new TypeError("ComfyUI settings id must be default");
  map.set("default", copyComfyUiSettings(seed));
}
