import { ApiClient } from "./api.js";

const body = document.body;
const api = new ApiClient(body.dataset.apiBase || window.location.origin, body.dataset.actorCharacterId || "");
const state = {
  worldId: body.dataset.storyWorldId || new URLSearchParams(window.location.search).get("storyWorldId") || "",
  worldTimezone: "UTC",
  readerCharacterId: body.dataset.readerCharacterId || new URLSearchParams(window.location.search).get("readerCharacterId") || "",
  actorSessionId: body.dataset.actorSessionId || new URLSearchParams(window.location.search).get("actorSessionId") || "",
  characters: [],
  conversations: [],
  conversationId: "",
  workflows: [],
};

const elements = {
  worldTitle: document.querySelector("#world-title"),
  worldSubtitle: document.querySelector("#world-subtitle"),
  characterSelect: document.querySelector("#character-select"),
  switchCharacter: document.querySelector("#switch-character"),
  feedStatus: document.querySelector("#feed-status"),
  feedGrid: document.querySelector("#feed-grid"),
  assetsStatus: document.querySelector("#assets-status"),
  assetsList: document.querySelector("#assets-list"),
  chatStatus: document.querySelector("#chat-status"),
  conversationSelect: document.querySelector("#conversation-select"),
  messagesList: document.querySelector("#messages-list"),
  messageInput: document.querySelector("#message-input"),
  messageKind: document.querySelector("#message-kind"),
  messageForm: document.querySelector("#message-form"),
  requestReply: document.querySelector("#request-reply"),
  relationshipsStatus: document.querySelector("#relationships-status"),
  relationshipCanvas: document.querySelector("#relationship-canvas"),
  relationshipList: document.querySelector("#relationship-list"),
  calendarStatus: document.querySelector("#calendar-status"),
  calendarMonth: document.querySelector("#calendar-month"),
  calendarOccurrences: document.querySelector("#calendar-occurrences"),
  calendarDefinitions: document.querySelector("#calendar-definitions"),
  settingsStatus: document.querySelector("#settings-status"),
  visualProfile: document.querySelector("#visual-profile"),
  workflowSelect: document.querySelector("#workflow-select"),
  workflowJson: document.querySelector("#workflow-json"),
  validateWorkflow: document.querySelector("#validate-workflow"),
  workflowValidation: document.querySelector("#workflow-validation"),
};

elements.calendarMonth.value = new Date().toISOString().slice(0, 7);

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.dataset.state = isError ? "error" : "";
}

function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function createText(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function createId(prefix) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

function renderCharacters() {
  clear(elements.characterSelect);
  for (const character of state.characters) {
    const option = document.createElement("option");
    option.value = character.id;
    option.textContent = `${character.displayName} · ${character.role}`;
    option.selected = character.id === state.readerCharacterId;
    elements.characterSelect.append(option);
  }
  elements.characterSelect.disabled = state.characters.length === 0;
}

function renderMoments(moments) {
  clear(elements.feedGrid);
  if (moments.length === 0) {
    elements.feedGrid.append(createText("p", "empty-state", "还没有动态，等角色自己留下些什么。"));
    return;
  }
  for (const moment of moments) {
    const card = document.createElement("article");
    card.className = "moment-card";
    const header = document.createElement("div");
    header.className = "moment-header";
    header.append(
      createText("span", "moment-author", moment.authorCharacterId),
      createText("time", "moment-time", new Date(moment.publishedAt).toLocaleString()),
    );
    card.append(header, createText("p", "moment-body", moment.body));
    if (moment.imageMediaRef) {
      const image = document.createElement("img");
      image.className = "moment-image";
      image.src = moment.imageMediaRef;
      image.alt = "动态配图";
      image.loading = "lazy";
      card.append(image);
    }
    const footer = document.createElement("div");
    footer.className = "moment-footer";
    const summary = createText("span", "interaction-summary", "正在读取互动……");
    const likeButton = document.createElement("button");
    likeButton.type = "button";
    likeButton.className = "interaction-button";
    likeButton.textContent = "喜欢";
    const comments = document.createElement("div");
    comments.className = "comment-list";
    const commentForm = document.createElement("form");
    commentForm.className = "comment-form";
    const commentInput = document.createElement("input");
    commentInput.placeholder = "写下评论……";
    commentInput.setAttribute("aria-label", "评论内容");
    const commentButton = document.createElement("button");
    commentButton.type = "submit";
    commentButton.textContent = "评论";
    commentForm.append(commentInput, commentButton);
    footer.append(createText("span", "pill", moment.visibility), likeButton, summary);
    card.append(footer, comments, commentForm);
    elements.feedGrid.append(card);
    likeButton.addEventListener("click", () => void likeMoment(moment, likeButton, summary, comments));
    commentForm.addEventListener("submit", (event) => void commentOnMoment(
      event,
      moment,
      commentInput,
      summary,
      comments,
      likeButton,
    ));
    void hydrateMomentInteractions(moment, summary, comments, likeButton);
  }
}

function renderInteractionState(interactions, summary, comments, likeButton) {
  const likes = interactions.filter((item) => item.kind === "LIKE");
  const replies = interactions.filter((item) => item.kind === "COMMENT");
  summary.textContent = `${likes.length} 喜欢 · ${replies.length} 评论`;
  likeButton.disabled = likes.some((item) => item.actorCharacterId === state.readerCharacterId);
  likeButton.textContent = likeButton.disabled ? "已喜欢" : "喜欢";
  clear(comments);
  for (const reply of replies) {
    const line = document.createElement("p");
    line.className = "comment-line";
    line.append(
      createText("strong", "comment-author", reply.actorCharacterId),
      document.createTextNode(` ${reply.text}`),
    );
    comments.append(line);
  }
}

async function hydrateMomentInteractions(moment, summary, comments, likeButton) {
  try {
    const interactions = (await api.getMomentInteractions(moment.id, state.readerCharacterId)).data ?? [];
    renderInteractionState(interactions, summary, comments, likeButton);
  } catch (error) {
    summary.textContent = error.message;
  }
}

async function likeMoment(moment, button, summary, comments) {
  const id = createId("like");
  button.disabled = true;
  try {
    await api.createMomentInteraction(moment.id, {
      id,
      actorCharacterId: state.readerCharacterId,
      kind: "LIKE",
      createdAt: new Date().toISOString(),
      idempotencyKey: id,
    });
    await hydrateMomentInteractions(moment, summary, comments, button);
  } catch (error) {
    summary.textContent = error.message;
    button.disabled = false;
  }
}

async function commentOnMoment(event, moment, input, summary, comments, likeButton) {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const id = createId("comment");
  input.disabled = true;
  try {
    await api.createMomentInteraction(moment.id, {
      id,
      actorCharacterId: state.readerCharacterId,
      kind: "COMMENT",
      text,
      createdAt: new Date().toISOString(),
      idempotencyKey: id,
    });
    input.value = "";
    await hydrateMomentInteractions(moment, summary, comments, likeButton);
  } catch (error) {
    summary.textContent = error.message;
  } finally {
    input.disabled = false;
  }
}

function renderConversations() {
  clear(elements.conversationSelect);
  for (const conversation of state.conversations) {
    const option = document.createElement("option");
    option.value = conversation.conversation.id;
    option.textContent = conversation.conversation.title || `${conversation.conversation.type} · ${conversation.conversation.id}`;
    option.selected = option.value === state.conversationId;
    elements.conversationSelect.append(option);
  }
  elements.conversationSelect.disabled = state.conversations.length === 0;
}

function renderMessages(messages) {
  clear(elements.messagesList);
  if (messages.length === 0) {
    elements.messagesList.append(createText("p", "empty-state", "这段对话还没有消息。"));
    return;
  }
  for (const message of messages) {
    const bubble = document.createElement("article");
    bubble.className = `message-bubble ${message.authorCharacterId === state.readerCharacterId ? "is-self" : ""}`;
    bubble.append(createText("span", "message-kind", message.kind));
    if (message.kind === "IMAGE" && message.mediaRef) {
      const image = document.createElement("img");
      image.className = "chat-image";
      image.src = message.mediaRef;
      image.alt = "聊天图片";
      image.loading = "lazy";
      bubble.append(image);
    } else {
      bubble.append(createText("p", "message-text", message.text || message.stickerId || "系统消息"));
    }
    elements.messagesList.append(bubble);
  }
}

function svgElement(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function renderRelationships(edges) {
  clear(elements.relationshipCanvas);
  clear(elements.relationshipList);
  const visibleIds = new Set(edges.flatMap((edge) => [edge.sourceCharacterId, edge.targetCharacterId]));
  const characters = state.characters.filter((character) => visibleIds.has(character.id));
  if (characters.length === 0) {
    elements.relationshipCanvas.append(createText("p", "empty-state", "这个世界还没有配置关系。"));
    return;
  }
  const width = 900;
  const height = 520;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(300, 120 + characters.length * 24);
  const positions = new Map(characters.map((character, index) => {
    const angle = (Math.PI * 2 * index) / characters.length - Math.PI / 2;
    return [character.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    }];
  }));
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "人物关系图" });
  const defs = svgElement("defs");
  const marker = svgElement("marker", { id: "relationship-arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" });
  marker.append(svgElement("path", { d: "M 0 0 L 10 5 L 0 10 z", class: "relationship-arrow" }));
  defs.append(marker);
  svg.append(defs);
  for (const edge of edges) {
    const source = positions.get(edge.sourceCharacterId);
    const target = positions.get(edge.targetCharacterId);
    if (!source || !target) continue;
    const line = svgElement("line", {
      x1: source.x,
      y1: source.y,
      x2: target.x,
      y2: target.y,
      class: `relationship-edge ${edge.isPublic ? "is-public" : "is-private"}`,
      "marker-end": "url(#relationship-arrow)",
      ...(edge.isBidirectional ? { "marker-start": "url(#relationship-arrow)" } : {}),
    });
    svg.append(line);
    const label = svgElement("text", {
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2 - 8,
      class: "relationship-label",
      "text-anchor": "middle",
    });
    label.textContent = edge.relationshipType;
    svg.append(label);
  }
  for (const character of characters) {
    const position = positions.get(character.id);
    const group = svgElement("g", { class: `relationship-node ${character.id === state.readerCharacterId ? "is-current" : ""}` });
    group.append(svgElement("circle", { cx: position.x, cy: position.y, r: 42 }));
    const label = svgElement("text", { x: position.x, y: position.y + 4, "text-anchor": "middle" });
    label.textContent = character.displayName;
    group.append(label);
    svg.append(group);
  }
  elements.relationshipCanvas.append(svg);

  for (const edge of edges) {
    const source = state.characters.find((item) => item.id === edge.sourceCharacterId)?.displayName ?? edge.sourceCharacterId;
    const target = state.characters.find((item) => item.id === edge.targetCharacterId)?.displayName ?? edge.targetCharacterId;
    const card = document.createElement("article");
    card.className = "relationship-card";
    card.append(
      createText("h3", "relationship-title", `${source} ${edge.isBidirectional ? "↔" : "→"} ${target}`),
      createText("p", "relationship-type", edge.relationshipType),
    );
    const metrics = document.createElement("div");
    metrics.className = "metric-grid";
    for (const [name, value] of Object.entries(edge.initialState)) {
      const metric = document.createElement("div");
      metric.className = "metric-item";
      metric.append(createText("span", "metric-name", name), createText("strong", "metric-value", String(value)));
      metrics.append(metric);
    }
    card.append(metrics);
    elements.relationshipList.append(card);
  }
}

function formatWorldTime(value) {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: state.worldTimezone,
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderCalendar(calendar) {
  clear(elements.calendarOccurrences);
  clear(elements.calendarDefinitions);
  if (calendar.occurrences.length === 0) {
    elements.calendarOccurrences.append(createText("p", "empty-state", "这个月暂时没有已排期事件。"));
  }
  const definitionById = new Map(calendar.definitions.map((item) => [item.id, item]));
  for (const occurrence of calendar.occurrences) {
    const definition = definitionById.get(occurrence.definitionId);
    const card = document.createElement("article");
    card.className = "calendar-occurrence";
    const date = createText("time", "calendar-date", formatWorldTime(occurrence.scheduledFor));
    const content = document.createElement("div");
    content.append(
      createText("h3", "calendar-event-name", definition?.name ?? occurrence.eventKey),
      createText("p", "calendar-event-meta", `${definition?.triggerSource ?? "EVENT"} · ${occurrence.status}`),
    );
    card.append(date, content, createText("span", `status-pill status-${occurrence.status.toLowerCase()}`, occurrence.status));
    elements.calendarOccurrences.append(card);
  }
  for (const definition of calendar.definitions) {
    const recurrence = definition.recurrence.kind === "ANNUAL"
      ? `每年 ${String(definition.recurrence.month).padStart(2, "0")}-${String(definition.recurrence.day).padStart(2, "0")} ${definition.recurrence.localTime}`
      : `一次性 ${formatWorldTime(definition.recurrence.runAt)}`;
    const card = document.createElement("article");
    card.className = "calendar-definition";
    card.append(
      createText("span", "pill", definition.triggerSource),
      createText("h3", "calendar-definition-name", definition.name),
      createText("p", "calendar-definition-recurrence", recurrence),
      createText("p", "calendar-definition-targets", `${definition.targetCharacterIds.length} 个目标角色 · 优先级 ${definition.priority}`),
    );
    elements.calendarDefinitions.append(card);
  }
}

function renderVisualProfile(identity) {
  clear(elements.visualProfile);
  elements.visualProfile.append(
    createText("p", "eyebrow", "CHARACTER VISUAL IDENTITY"),
    createText("h3", "visual-profile-title", identity ? `Revision ${identity.revision}` : "尚未配置视觉档案"),
  );
  if (!identity) {
    elements.visualProfile.append(createText("p", "muted", "当前角色需要先在后端导入视觉身份。"));
    return;
  }
  elements.visualProfile.append(
    createText("p", "visual-prompt", identity.positivePrompt),
    createText("p", "visual-negative", identity.negativePrompt ? `负面词：${identity.negativePrompt}` : "未配置负面词"),
  );
  const tags = document.createElement("div");
  tags.className = "visual-tags";
  for (const tag of identity.styleTags) tags.append(createText("span", "pill", tag));
  elements.visualProfile.append(tags, createText("p", "muted", `${identity.referenceImageRefs.length} 张参考图`));
}

function renderWorkflowEditor() {
  clear(elements.workflowSelect);
  for (const workflow of state.workflows) {
    const option = document.createElement("option");
    option.value = `${workflow.id}@${workflow.version}`;
    option.textContent = option.value;
    elements.workflowSelect.append(option);
  }
  const selected = state.workflows[0];
  elements.workflowSelect.disabled = !selected;
  elements.workflowJson.value = selected ? JSON.stringify(selected, null, 2) : "";
}

async function loadWorld() {
  try {
    const worlds = (await api.getWorlds()).data ?? [];
    const world = worlds.find((item) => item.id === state.worldId) ?? worlds[0];
    if (!world) throw new Error("没有可用故事世界");
    state.worldId = world.id;
    state.worldTimezone = world.timezone;
    elements.worldTitle.textContent = world.name;
    elements.worldSubtitle.textContent = `${world.timezone} · ${world.storyMode === "STATIC" ? "静态剧情" : "动态生活"}`;
    state.characters = (await api.getCharacters(state.worldId)).data ?? [];
    if (!state.readerCharacterId || !state.characters.some((item) => item.id === state.readerCharacterId)) {
    state.readerCharacterId = state.characters.find((item) => item.role === "USER")?.id ?? state.characters[0]?.id ?? "";
    }
    api.setActorCharacterId(state.readerCharacterId);
    renderCharacters();
  } catch (error) {
    elements.worldTitle.textContent = "无法连接故事世界";
    elements.worldSubtitle.textContent = error.message;
  }
}

async function loadFeed() {
  if (!state.worldId || !state.readerCharacterId) {
    setStatus(elements.feedStatus, "请先配置故事世界和当前角色。", true);
    return;
  }
  setStatus(elements.feedStatus, "正在读取动态……");
  try {
    const moments = (await api.getMoments(state.worldId, state.readerCharacterId)).data ?? [];
    renderMoments(moments);
    setStatus(elements.feedStatus, `${moments.length} 条最近动态`);
  } catch (error) {
    setStatus(elements.feedStatus, error.message, true);
  }
}

async function loadAssets() {
  if (!state.worldId) return;
  setStatus(elements.assetsStatus, "正在读取表情包……");
  clear(elements.assetsList);
  try {
    const packs = (await api.getStickerPacks(state.worldId)).data ?? [];
    for (const pack of packs) {
      const section = document.createElement("section");
      section.className = "asset-pack";
      section.append(createText("h3", "asset-pack-title", pack.name));
      const grid = document.createElement("div");
      grid.className = "sticker-grid";
      const stickers = (await api.getStickers(pack.id)).data ?? [];
      for (const sticker of stickers) {
        const item = document.createElement("figure");
        item.className = "sticker-item";
        const image = document.createElement("img");
        image.src = sticker.mediaRef;
        image.alt = sticker.label;
        image.loading = "lazy";
        const send = document.createElement("button");
        send.type = "button";
        send.className = "sticker-send";
        send.textContent = "发送到当前会话";
        send.disabled = !state.conversationId || !state.readerCharacterId;
        send.addEventListener("click", () => void sendSticker(sticker, send));
        item.append(image, createText("figcaption", "sticker-label", sticker.label), send);
        grid.append(item);
      }
      section.append(grid);
      elements.assetsList.append(section);
    }
    setStatus(elements.assetsStatus, `${packs.length} 个表情包`);
  } catch (error) {
    setStatus(elements.assetsStatus, error.message, true);
  }
}

async function loadConversations() {
  if (!state.readerCharacterId) return;
  setStatus(elements.chatStatus, "正在读取会话……");
  try {
    state.conversations = (await api.getConversations(state.readerCharacterId)).data ?? [];
    state.conversationId = state.conversations.some((item) => item.conversation.id === state.conversationId)
      ? state.conversationId
      : state.conversations[0]?.conversation.id ?? "";
    renderConversations();
    await loadMessages();
    setStatus(elements.chatStatus, `${state.conversations.length} 个会话`);
  } catch (error) {
    setStatus(elements.chatStatus, error.message, true);
  }
}

async function loadRelationships() {
  if (!state.worldId) return;
  setStatus(elements.relationshipsStatus, "正在读取关系网……");
  try {
    const edges = (await api.getRelationships(state.worldId)).data ?? [];
    renderRelationships(edges);
    setStatus(elements.relationshipsStatus, `${edges.length} 条关系 · ${state.characters.length} 个角色`);
  } catch (error) {
    setStatus(elements.relationshipsStatus, error.message, true);
  }
}

async function loadCalendar() {
  if (!state.worldId) return;
  const month = elements.calendarMonth.value || new Date().toISOString().slice(0, 7);
  const startsAtDate = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(startsAtDate.getTime())) {
    setStatus(elements.calendarStatus, "请选择有效月份。", true);
    return;
  }
  const endsAtDate = new Date(startsAtDate);
  endsAtDate.setUTCMonth(endsAtDate.getUTCMonth() + 1);
  setStatus(elements.calendarStatus, "正在读取世界日历……");
  try {
    const calendar = (await api.getWorldCalendar(
      state.worldId,
      startsAtDate.toISOString(),
      endsAtDate.toISOString(),
    )).data;
    renderCalendar(calendar);
    setStatus(
      elements.calendarStatus,
      `${calendar.occurrences.length} 个排期 · ${calendar.definitions.length} 个事件定义 · ${state.worldTimezone}`,
    );
  } catch (error) {
    setStatus(elements.calendarStatus, error.message, true);
  }
}

async function loadSettings() {
  if (!state.readerCharacterId) return;
  setStatus(elements.settingsStatus, "正在读取视觉档案与 Workflow……");
  let identity;
  try {
    identity = (await api.getCharacterVisualIdentity(state.readerCharacterId)).data;
  } catch {
    identity = undefined;
  }
  renderVisualProfile(identity);
  try {
    state.workflows = (await api.getWorkflows()).data ?? [];
    renderWorkflowEditor();
    setStatus(elements.settingsStatus, `${state.workflows.length} 个 Workflow 模板`);
  } catch (error) {
    setStatus(elements.settingsStatus, error.message, true);
  }
}

async function validateWorkflowEditor() {
  let workflow;
  try {
    workflow = JSON.parse(elements.workflowJson.value);
  } catch {
    setStatus(elements.workflowValidation, "Workflow JSON 格式无效。", true);
    return;
  }
  elements.validateWorkflow.disabled = true;
  try {
    const result = (await api.validateWorkflow(workflow)).data;
    setStatus(
      elements.workflowValidation,
      `验证通过：${result.id}@${result.version} · ${result.checkedBindings.join("、")}`,
    );
  } catch (error) {
    setStatus(elements.workflowValidation, error.message, true);
  } finally {
    elements.validateWorkflow.disabled = false;
  }
}

async function loadMessages() {
  if (!state.conversationId || !state.readerCharacterId) {
    renderMessages([]);
    return;
  }
  try {
    const messages = (await api.getMessages(state.conversationId, state.readerCharacterId)).data ?? [];
    renderMessages(messages);
  } catch (error) {
    setStatus(elements.chatStatus, error.message, true);
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const value = elements.messageInput.value.trim();
  const kind = elements.messageKind.value;
  if (!value || !state.conversationId || !state.readerCharacterId) return;
  const id = globalThis.crypto?.randomUUID?.() ?? `message-${Date.now()}`;
  elements.messageInput.disabled = true;
  try {
    await api.sendMessage(state.conversationId, {
      id,
      authorCharacterId: state.readerCharacterId,
      kind,
      ...(kind === "IMAGE" ? { mediaRef: value } : { text: value }),
      createdAt: new Date().toISOString(),
      idempotencyKey: id,
    });
    elements.messageInput.value = "";
    await loadMessages();
  } catch (error) {
    setStatus(elements.chatStatus, error.message, true);
  } finally {
    elements.messageInput.disabled = false;
    elements.messageInput.focus();
  }
}

async function sendSticker(sticker, button) {
  if (!state.conversationId || !state.readerCharacterId) {
    setStatus(elements.assetsStatus, "请先选择一个会话。", true);
    return;
  }
  const id = createId("sticker-message");
  button.disabled = true;
  try {
    await api.sendMessage(state.conversationId, {
      id,
      authorCharacterId: state.readerCharacterId,
      kind: "STICKER",
      stickerId: sticker.id,
      createdAt: new Date().toISOString(),
      idempotencyKey: id,
    });
    setStatus(elements.assetsStatus, `已发送表情：${sticker.label}`);
    await loadMessages();
  } catch (error) {
    setStatus(elements.assetsStatus, error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function requestReply() {
  if (!state.conversationId || !state.readerCharacterId) return;
  const bubble = document.createElement("article");
  bubble.className = "message-bubble is-streaming";
  const label = createText("span", "message-kind", "ASSISTANT · STREAMING");
  const content = createText("p", "message-text", "");
  bubble.append(label, content);
  elements.messagesList.append(bubble);
  elements.messagesList.scrollTop = elements.messagesList.scrollHeight;
  elements.requestReply.disabled = true;
  try {
    await api.streamConversation(state.conversationId, state.readerCharacterId, {
      onDelta(delta) {
        if (typeof delta?.content === "string") content.textContent += delta.content;
        elements.messagesList.scrollTop = elements.messagesList.scrollHeight;
      },
      onError(error) {
        throw new Error(error?.message ?? "生成回复失败");
      },
      onDone() {
        label.textContent = "ASSISTANT";
        bubble.classList.remove("is-streaming");
      },
    });
  } catch (error) {
    label.textContent = "STREAM ERROR";
    content.textContent = error.message;
    setStatus(elements.chatStatus, error.message, true);
  } finally {
    elements.requestReply.disabled = false;
  }
}

async function switchCharacter() {
  const nextId = elements.characterSelect.value;
  if (!state.actorSessionId || !nextId) {
    state.readerCharacterId = nextId;
    api.setActorCharacterId(nextId);
    await Promise.all([loadFeed(), loadConversations()]);
    return;
  }
  elements.switchCharacter.disabled = true;
  try {
    await api.switchCharacter(state.actorSessionId, nextId);
    state.readerCharacterId = nextId;
    api.setActorCharacterId(nextId);
    await Promise.all([loadFeed(), loadConversations()]);
  } catch (error) {
    setStatus(elements.feedStatus, error.message, true);
  } finally {
    elements.switchCharacter.disabled = false;
  }
}

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => {
    for (const candidate of document.querySelectorAll(".tab")) candidate.classList.toggle("is-active", candidate === tab);
    document.querySelector("#feed-view").classList.toggle("is-hidden", tab.dataset.view !== "feed");
    document.querySelector("#chat-view").classList.toggle("is-hidden", tab.dataset.view !== "chat");
    document.querySelector("#relationships-view").classList.toggle("is-hidden", tab.dataset.view !== "relationships");
    document.querySelector("#calendar-view").classList.toggle("is-hidden", tab.dataset.view !== "calendar");
    document.querySelector("#settings-view").classList.toggle("is-hidden", tab.dataset.view !== "settings");
    document.querySelector("#assets-view").classList.toggle("is-hidden", tab.dataset.view !== "assets");
    if (tab.dataset.view === "assets") void loadAssets();
    if (tab.dataset.view === "chat") void loadConversations();
    if (tab.dataset.view === "relationships") void loadRelationships();
    if (tab.dataset.view === "calendar") void loadCalendar();
    if (tab.dataset.view === "settings") void loadSettings();
  });
}
elements.switchCharacter.addEventListener("click", () => void switchCharacter());
elements.characterSelect.addEventListener("change", () => {
  state.readerCharacterId = elements.characterSelect.value;
  api.setActorCharacterId(state.readerCharacterId);
  void loadFeed();
  void loadConversations();
});
document.querySelector("#refresh-feed").addEventListener("click", () => void loadFeed());
document.querySelector("#refresh-assets").addEventListener("click", () => void loadAssets());
document.querySelector("#refresh-chat").addEventListener("click", () => void loadConversations());
document.querySelector("#refresh-relationships").addEventListener("click", () => void loadRelationships());
document.querySelector("#refresh-calendar").addEventListener("click", () => void loadCalendar());
elements.calendarMonth.addEventListener("change", () => void loadCalendar());
document.querySelector("#refresh-settings").addEventListener("click", () => void loadSettings());
elements.validateWorkflow.addEventListener("click", () => void validateWorkflowEditor());
elements.workflowSelect.addEventListener("change", () => {
  const workflow = state.workflows.find(
    (item) => `${item.id}@${item.version}` === elements.workflowSelect.value,
  );
  elements.workflowJson.value = workflow ? JSON.stringify(workflow, null, 2) : "";
  setStatus(elements.workflowValidation, "");
});
elements.requestReply.addEventListener("click", () => void requestReply());
elements.conversationSelect.addEventListener("change", () => {
  state.conversationId = elements.conversationSelect.value;
  void loadMessages();
});
elements.messageForm.addEventListener("submit", (event) => void sendMessage(event));
elements.messageKind.addEventListener("change", () => {
  elements.messageInput.placeholder = elements.messageKind.value === "IMAGE"
    ? "输入 mediaRef 或图片 URL……"
    : "写一句话……";
});

await loadWorld();
await loadFeed();
await loadConversations();
