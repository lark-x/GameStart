import type { V2ReleaseManifest } from "./release.ts";

export function buildV2CoreExportMarkdown(input: {
  readonly title: string;
  readonly sourceLabel: string;
  readonly scenes: readonly { readonly sceneId: string; readonly title: string; readonly body?: string }[];
  readonly choices: readonly { readonly sourceSceneId: string; readonly label: string; readonly targetSceneId?: string }[];
}): string {
  const lines = [
    `# ${input.title}`,
    "",
    `Source: ${input.sourceLabel}`,
    "",
    "## Scenes",
  ];
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
  };
}
