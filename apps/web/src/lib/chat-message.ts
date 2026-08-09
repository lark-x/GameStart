export interface ChatMessageDisplay {
  body: string;
  extras: string[];
}

const EXTRA_TAG = /<(think|thinking|analysis|metadata|debug|tool|internal)[^>]*>([\s\S]*?)<\/\1>/gi;
const EXTRA_FENCE = /```(?:debug|metadata|trace|json)\s*\n([\s\S]*?)```/gi;
const EXTRA_LINE = /^\s*(?:DEBUG|TRACE|METADATA|SYSTEM INFO|TOOL OUTPUT)\s*[:：]\s*(.+)$/i;

function readablePlainText(value: string): string {
  return value
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n");
}

export function splitChatMessage(text: string | undefined | null): ChatMessageDisplay {
  let body = typeof text === "string" ? text : "";
  const extras: string[] = [];
  body = body.replace(EXTRA_TAG, (_match, tag: string, value: string) => {
    const content = value.trim();
    if (content) extras.push(`${tag}: ${content}`);
    return "";
  });
  body = body.replace(EXTRA_FENCE, (_match, value: string) => {
    const content = value.trim();
    if (content) extras.push(content);
    return "";
  });
  const kept: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(EXTRA_LINE);
    if (match?.[1]) extras.push(match[1].trim());
    else kept.push(line);
  }
  return { body: readablePlainText(kept.join("\n")).replace(/\n{3,}/g, "\n\n").trim(), extras };
}
