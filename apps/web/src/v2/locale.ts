import { computed, ref } from "vue";

export type V2Locale = "en" | "zh-CN";
type V2Message = { readonly en: string; readonly "zh-CN": string };

export const v2Messages = {
  "app.product": { en: "V2 Web Product", "zh-CN": "V2 \u7f51\u9875\u4ea7\u54c1" },
  "app.title": { en: "Creator Game Platform", "zh-CN": "\u521b\u4f5c\u8005\u6e38\u620f\u5e73\u53f0" },
  "app.description": { en: "Local creator workspace for canon editing, candidate review, immutable release checks, and player runtime previews.", "zh-CN": "\u7528\u4e8e\u8bbe\u5b9a\u7f16\u8f91\u3001\u5019\u9009\u5185\u5bb9\u5ba1\u6838\u3001\u4e0d\u53ef\u53d8\u53d1\u5e03\u68c0\u67e5\u548c\u73a9\u5bb6\u8fd0\u884c\u9884\u89c8\u7684\u672c\u5730\u521b\u4f5c\u5de5\u4f5c\u533a\u3002" },
  "action.switchLanguage": { en: "Switch language", "zh-CN": "\u5207\u6362\u8bed\u8a00" },
  "action.refresh": { en: "Refresh Snapshot", "zh-CN": "\u5237\u65b0\u5feb\u7167" },
  "action.createWorld": { en: "Create Starter World", "zh-CN": "\u521b\u5efa\u521d\u59cb\u4e16\u754c" },
  "area.canon": { en: "Canon", "zh-CN": "\u8bbe\u5b9a" },
  "area.graph": { en: "Graph", "zh-CN": "\u5267\u60c5\u56fe" },
  "area.review": { en: "Review", "zh-CN": "\u5ba1\u6838" },
  "area.assets": { en: "Assets", "zh-CN": "\u8d44\u4ea7" },
  "area.release": { en: "Release", "zh-CN": "\u53d1\u5e03" },
  "area.player": { en: "Player", "zh-CN": "\u6e38\u73a9" },
  "area.operations": { en: "Ops", "zh-CN": "\u8fd0\u884c" },
  "label.workspace": { en: "workspace", "zh-CN": "\u5de5\u4f5c\u533a" },
  "label.workspaceAreas": { en: "V2 workspace areas", "zh-CN": "V2 \u5de5\u4f5c\u533a\u6a21\u5757" },
  "label.status": { en: "V2 workspace status", "zh-CN": "V2 \u5de5\u4f5c\u533a\u72b6\u6001" },
  "label.adapter": { en: "Adapter", "zh-CN": "\u9002\u914d\u5668" },
  "label.adapterControls": { en: "Adapter controls", "zh-CN": "\u9002\u914d\u5668\u63a7\u5236" },
  "label.health": { en: "Health", "zh-CN": "\u5065\u5eb7\u72b6\u6001" },
  "label.revision": { en: "Revision", "zh-CN": "\u4fee\u8ba2\u7248\u672c" },
  "label.candidate": { en: "Candidate", "zh-CN": "\u5019\u9009\u5185\u5bb9" },
  "label.assetCandidate": { en: "Asset candidate", "zh-CN": "\u8d44\u4ea7\u5019\u9009" },
  "label.assetLibrary": { en: "Asset library", "zh-CN": "\u8d44\u4ea7\u5e93" },
  "label.graphDiagnostics": { en: "Graph diagnostics", "zh-CN": "\u5267\u60c5\u56fe\u8bca\u65ad" },
  "label.statePreview": { en: "State preview", "zh-CN": "\u72b6\u6001\u9884\u89c8" },
  "label.currentScene": { en: "Current scene", "zh-CN": "\u5f53\u524d\u573a\u666f" },
  "status.valid": { en: "preflight valid", "zh-CN": "\u9884\u68c0\u901a\u8fc7" },
  "status.blocked": { en: "blocked", "zh-CN": "\u5df2\u963b\u6b62" },
  "panel.canon": { en: "Canon Workspace", "zh-CN": "\u8bbe\u5b9a\u5de5\u4f5c\u533a" },
  "panel.graph": { en: "Narrative Graph", "zh-CN": "\u53d9\u4e8b\u56fe\u8c31" },
  "panel.review": { en: "Candidate Review", "zh-CN": "\u5019\u9009\u5185\u5bb9\u5ba1\u6838" },
  "panel.assets": { en: "Asset Workbench", "zh-CN": "\u8d44\u4ea7\u5de5\u4f5c\u53f0" },
  "panel.release": { en: "Release Desk", "zh-CN": "\u53d1\u5e03\u5de5\u4f5c\u53f0" },
  "panel.player": { en: "Player Runtime", "zh-CN": "\u73a9\u5bb6\u8fd0\u884c\u65f6" },
  "panel.operations": { en: "Operations", "zh-CN": "\u8fd0\u884c\u72b6\u6001" },
  "state.loading": { en: "Loading V2 workspace snapshot", "zh-CN": "\u6b63\u5728\u52a0\u8f7d V2 \u5de5\u4f5c\u533a\u5feb\u7167" },
  "state.noSnapshotTitle": { en: "No V2 snapshot loaded", "zh-CN": "\u5c1a\u672a\u52a0\u8f7d V2 \u5feb\u7167" },
  "state.noSnapshotDescription": { en: "Use refresh to load the typed adapter snapshot.", "zh-CN": "\u4f7f\u7528\u5237\u65b0\u6309\u94ae\u52a0\u8f7d\u7c7b\u578b\u5316\u9002\u914d\u5668\u5feb\u7167\u3002" },
  "field.worldName": { en: "World name", "zh-CN": "\u4e16\u754c\u540d\u79f0" },
  "field.premise": { en: "Premise", "zh-CN": "\u524d\u63d0\u8bbe\u5b9a" },
  "field.expectedRevision": { en: "Expected revision", "zh-CN": "\u9884\u671f\u4fee\u8ba2\u7248\u672c" },
  "action.preview": { en: "Preview Revision", "zh-CN": "\u9884\u89c8\u4fee\u8ba2" },
  "action.reset": { en: "Reset Draft", "zh-CN": "\u91cd\u7f6e\u8349\u7a3f" },
  "action.createJob": { en: "Create Job", "zh-CN": "\u521b\u5efa\u4efb\u52a1" },
  "action.approve": { en: "Approve", "zh-CN": "\u6279\u51c6" },
  "action.requestChanges": { en: "Request Changes", "zh-CN": "\u8bf7\u6c42\u4fee\u6539" },
  "action.reject": { en: "Reject", "zh-CN": "\u62d2\u7edd" },
  "action.createRelease": { en: "Create Release", "zh-CN": "\u521b\u5efa\u53d1\u5e03\u7248\u672c" },
  "action.startRun": { en: "Start Player Run", "zh-CN": "\u5f00\u59cb\u6e38\u73a9" },
  "action.export": { en: "Export", "zh-CN": "\u5bfc\u51fa" },
  "action.save": { en: "Save Run", "zh-CN": "\u4fdd\u5b58\u8fdb\u5ea6" },
  "action.restore": { en: "Restore Save", "zh-CN": "\u6062\u590d\u5b58\u6863" },
  "feedback.candidateMarked": { en: "Candidate marked {status}.", "zh-CN": "\u5019\u9009\u5185\u5bb9\u5df2\u6807\u8bb0\u4e3a {status}\u3002" },
  "feedback.assetMarked": { en: "Asset candidate marked {status}.", "zh-CN": "\u8d44\u4ea7\u5019\u9009\u5df2\u6807\u8bb0\u4e3a {status}\u3002" },
  "feedback.sceneLoaded": { en: "Loaded scene {sceneId}.", "zh-CN": "\u5df2\u52a0\u8f7d\u573a\u666f {sceneId}\u3002" },
  "feedback.runStarted": { en: "Started run {runId}.", "zh-CN": "\u5df2\u542f\u52a8\u8fd0\u884c {runId}\u3002" },
  "feedback.saved": { en: "Saved {label}.", "zh-CN": "\u5df2\u4fdd\u5b58 {label}\u3002" },
  "feedback.restored": { en: "Restored {label}.", "zh-CN": "\u5df2\u6062\u590d {label}\u3002" },
  "feedback.prepared": { en: "Prepared {filename}.", "zh-CN": "\u5df2\u51c6\u5907\u597d {filename}\u3002" },} as const satisfies Record<string, V2Message>;


export const v2LegacyMessages: Readonly<Record<string, V2Message>> = Object.fromEntries([
  ["Canon Workspace", "\\u8bbe\\u5b9a\\u5de5\\u4f5c\\u533a"], ["Narrative Graph", "\\u53d9\\u4e8b\\u56fe\\u8c31"], ["Candidate Review", "\\u5019\\u9009\\u5185\\u5bb9\\u5ba1\\u6838"], ["Asset Workbench", "\\u8d44\\u4ea7\\u5de5\\u4f5c\\u53f0"], ["Release Desk", "\\u53d1\\u5e03\\u5de5\\u4f5c\\u53f0"], ["Player Runtime", "\\u73a9\\u5bb6\\u8fd0\\u884c\\u65f6"], ["Operations", "\\u8fd0\\u884c\\u72b6\\u6001"],
  ["Loading V2 workspace snapshot", "\\u6b63\\u5728\\u52a0\\u8f7d V2 \\u5de5\\u4f5c\\u533a\\u5feb\\u7167"], ["No V2 snapshot loaded", "\\u5c1a\\u672a\\u52a0\\u8f7d V2 \\u5feb\\u7167"], ["World name", "\\u4e16\\u754c\\u540d\\u79f0"], ["Premise", "\\u524d\\u63d0\\u8bbe\\u5b9a"], ["Expected revision", "\\u9884\\u671f\\u4fee\\u8ba2\\u7248\\u672c"], ["Preview Revision", "\\u9884\\u89c8\\u4fee\\u8ba2"], ["Reset Draft", "\\u91cd\\u7f6e\\u8349\\u7a3f"],
  ["Generation prompt", "\\u751f\\u6210\\u63d0\\u793a\\u8bcd"], ["Create Job", "\\u521b\\u5efa\\u4efb\\u52a1"], ["Reviewer", "\\u5ba1\\u6838\\u4eba"], ["Review reason", "\\u5ba1\\u6838\\u539f\\u56e0"], ["Approve", "\\u6279\\u51c6"], ["Request Changes", "\\u8bf7\\u6c42\\u4fee\\u6539"], ["Reject", "\\u62d2\\u7edd"],
  ["Asset prompt", "\\u8d44\\u4ea7\\u63d0\\u793a\\u8bcd"], ["Create Asset Job", "\\u521b\\u5efa\\u8d44\\u4ea7\\u4efb\\u52a1"], ["Asset review reason", "\\u8d44\\u4ea7\\u5ba1\\u6838\\u539f\\u56e0"], ["Approve Asset", "\\u6279\\u51c6\\u8d44\\u4ea7"], ["Request Asset Changes", "\\u8bf7\\u6c42\\u4fee\\u6539\\u8d44\\u4ea7"], ["Reject Asset", "\\u62d2\\u7edd\\u8d44\\u4ea7"],
  ["Preflight", "\\u53d1\\u5e03\\u9884\\u68c0"], ["Immutability", "\\u4e0d\\u53ef\\u53d8\\u6027"], ["Create Release", "\\u521b\\u5efa\\u53d1\\u5e03\\u7248\\u672c"], ["Start Player Run", "\\u5f00\\u59cb\\u6e38\\u73a9"], ["Export format", "\\u5bfc\\u51fa\\u683c\\u5f0f"], ["Export", "\\u5bfc\\u51fa"], ["Save label", "\\u5b58\\u6863\\u540d\\u79f0"], ["Save Run", "\\u4fdd\\u5b58\\u8fdb\\u5ea6"], ["Restore Save", "\\u6062\\u590d\\u5b58\\u6863"],
  ["Adapter", "\\u9002\\u914d\\u5668"], ["Mock Fixture", "\\u6a21\\u62df\\u6570\\u636e"], ["Adapter controls", "\\u9002\\u914d\\u5668\\u63a7\\u5236"], ["Refresh V2 snapshot", "\\u5237\\u65b0 V2 \\u5feb\\u7167"], ["Health", "\\u5065\\u5eb7\\u72b6\\u6001"], ["Workspace", "\\u5de5\\u4f5c\\u533a"], ["Revision", "\\u4fee\\u8ba2\\u7248\\u672c"], ["Candidate", "\\u5019\\u9009\\u5185\\u5bb9"], ["Asset candidate", "\\u8d44\\u4ea7\\u5019\\u9009"], ["Asset library", "\\u8d44\\u4ea7\\u5e93"], ["Release", "\\u53d1\\u5e03"], ["Graph diagnostics", "\\u5267\\u60c5\\u56fe\\u8bca\\u65ad"], ["State preview", "\\u72b6\\u6001\\u9884\\u89c8"], ["Current scene", "\\u5f53\\u524d\\u573a\\u666f"], ["Characters", "\\u89d2\\u8272"], ["Locations", "\\u5730\\u70b9"], ["Workflow", "\\u5de5\\u4f5c\\u6d41"], ["Seed", "\\u79cd\\u5b50"], ["Media", "\\u5a92\\u4f53"], ["Thumbnail", "\\u7f29\\u7565\\u56fe"], ["Save", "\\u5b58\\u6863"], ["Scene", "\\u573a\\u666f"], ["Graph", "\\u5267\\u60c5\\u56fe"], ["Runtime", "\\u8fd0\\u884c\\u65f6"],
].map(([en, chinese]) => [en, { en, "zh-CN": chinese }])) as Record<string, V2Message>;
export type V2MessageKey = keyof typeof v2Messages;
const storageKey = "living-network-v2-locale";
const locale = ref<V2Locale>("en");
export const v2Locale = computed(() => locale.value);

export function initV2Locale(): void {
  if (typeof window === "undefined") return;
  locale.value = window.localStorage.getItem(storageKey) === "zh-CN" ? "zh-CN" : "en";
  document.documentElement.lang = locale.value;
}

export function setV2Locale(value: V2Locale): void {
  locale.value = value;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, value);
  document.documentElement.lang = value;
}

export function formatV2Message(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}


export function t(key: V2MessageKey): string {
  return v2Messages[key][locale.value];
}
export function tr(english: string): string { return v2LegacyMessages[english]?.[locale.value] ?? english; }
