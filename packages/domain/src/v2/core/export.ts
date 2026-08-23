import type { V2ReleaseManifest } from "./release.ts";

export interface V2CoreExportMarkdownInput {
  readonly title: string;
  readonly sourceLabel: string;
  readonly arcs?: readonly { readonly arcId: string; readonly title: string; readonly summary?: string }[];
  readonly chapters?: readonly { readonly chapterId: string; readonly arcId?: string; readonly title: string; readonly summary?: string }[];
  readonly quests?: readonly { readonly questId: string; readonly chapterId?: string; readonly arcId?: string; readonly title: string; readonly summary?: string }[];
  readonly scenes: readonly {
    readonly sceneId: string;
    readonly title: string;
    readonly body?: string;
    readonly arcId?: string;
    readonly chapterId?: string;
    readonly questId?: string;
  }[];
  readonly choices: readonly { readonly sourceSceneId: string; readonly label: string; readonly targetSceneId?: string }[];
}

export function buildV2CoreExportMarkdown(input: V2CoreExportMarkdownInput): string {
  const lines = [
    `# ${input.title}`,
    "",
    `Source: ${input.sourceLabel}`,
    "",
  ];

  // If no hierarchy provided, export plain scenes
  if (!input.arcs?.length && !input.chapters?.length && !input.quests?.length) {
    lines.push("## Scenes");
    for (const scene of input.scenes) {
      lines.push("", `### ${scene.title}`, "", `- Scene ID: ${scene.sceneId}`);
      if (scene.body) lines.push("", scene.body);
      const choices = input.choices.filter((choice) => choice.sourceSceneId === scene.sceneId);
      if (choices.length > 0) {
        lines.push("", "Choices:");
        for (const choice of choices) {
          lines.push(`- ${choice.label}${choice.targetSceneId ? ` -> ${choice.targetSceneId}` : ""}`);
        }
      }
    }
    return `${lines.join("\n")}\n`;
  }

  // Structured Hierarchy Export
  lines.push("## 故事大纲与正典剧本", "");

  const arcs = input.arcs ?? [{ arcId: "__default__", title: "主要篇章" }];
  for (const arc of arcs) {
    if (arc.arcId !== "__default__") {
      lines.push(`### 篇章：${arc.title}`, "");
      if (arc.summary) lines.push(`> ${arc.summary}`, "");
    }

    const arcChapters = (input.chapters ?? []).filter((c) => c.arcId === arc.arcId);
    if (arcChapters.length === 0) {
      const arcScenes = input.scenes.filter((s) => s.arcId === arc.arcId || (!s.arcId && arc.arcId === "__default__"));
      for (const scene of arcScenes) {
        lines.push(`#### 场景：${scene.title}`, "", `- Scene ID: \`${scene.sceneId}\``);
        if (scene.body) lines.push("", scene.body);
        const choices = input.choices.filter((choice) => choice.sourceSceneId === scene.sceneId);
        if (choices.length > 0) {
          lines.push("", "分支选项:");
          for (const choice of choices) {
            lines.push(`- [ ] ${choice.label}${choice.targetSceneId ? ` $\\to$ \`${choice.targetSceneId}\`` : ""}`);
          }
        }
        lines.push("");
      }
      continue;
    }

    for (const chapter of arcChapters) {
      lines.push(`#### 章节：${chapter.title}`, "");
      if (chapter.summary) lines.push(`> ${chapter.summary}`, "");

      const chQuests = (input.quests ?? []).filter((q) => q.chapterId === chapter.chapterId);
      if (chQuests.length === 0) {
        const chScenes = input.scenes.filter((s) => s.chapterId === chapter.chapterId);
        for (const scene of chScenes) {
          lines.push(`##### 场景：${scene.title}`, "", `- Scene ID: \`${scene.sceneId}\``);
          if (scene.body) lines.push("", scene.body);
          const choices = input.choices.filter((choice) => choice.sourceSceneId === scene.sceneId);
          if (choices.length > 0) {
            lines.push("", "分支选项:");
            for (const choice of choices) {
              lines.push(`- [ ] ${choice.label}${choice.targetSceneId ? ` $\\to$ \`${choice.targetSceneId}\`` : ""}`);
            }
          }
          lines.push("");
        }
        continue;
      }

      for (const quest of chQuests) {
        lines.push(`##### 任务：${quest.title}`, "");
        if (quest.summary) lines.push(`> ${quest.summary}`, "");

        const qScenes = input.scenes.filter((s) => s.questId === quest.questId);
        for (const scene of qScenes) {
          lines.push(`###### 场景：${scene.title}`, "", `- Scene ID: \`${scene.sceneId}\``);
          if (scene.body) lines.push("", scene.body);
          const choices = input.choices.filter((choice) => choice.sourceSceneId === scene.sceneId);
          if (choices.length > 0) {
            lines.push("", "分支选项:");
            for (const choice of choices) {
              lines.push(`- [ ] ${choice.label}${choice.targetSceneId ? ` $\\to$ \`${choice.targetSceneId}\`` : ""}`);
            }
          }
          lines.push("");
        }
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export function buildV2ReleaseExportJson(manifest: V2ReleaseManifest): unknown {
  return {
    releaseId: manifest.releaseId,
    storyWorldId: manifest.storyWorldId,
    version: manifest.version,
    sourceRevision: manifest.sourceRevision,
    contentHash: manifest.contentHash,
    canon: manifest.canon,
    graph: manifest.graph,
    stateSchema: manifest.stateSchema,
    ...(manifest.narrative ? { narrative: manifest.narrative } : {}),
  };
}
