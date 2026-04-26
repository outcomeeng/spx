import { parse as parseYaml } from "yaml";

export function parseFrontMatter(content: string): Record<string, unknown> {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return {};
  const parsed = parseYaml(content.slice(4, end));
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

export function extractSessionFile(output: string): string {
  const match = /<SESSION_FILE>(.*?)<\/SESSION_FILE>/.exec(output);
  if (!match?.[1]) throw new Error(`No SESSION_FILE tag in handoff output`);
  return match[1];
}
