import { SESSION_FRONT_MATTER_CLOSE, SESSION_FRONT_MATTER_OPEN } from "@/domains/session/create";
import { parse as parseYaml } from "yaml";

export function parseFrontMatter(content: string): Record<string, unknown> {
  if (!content.startsWith(SESSION_FRONT_MATTER_OPEN)) return {};
  const end = content.indexOf(SESSION_FRONT_MATTER_CLOSE, SESSION_FRONT_MATTER_OPEN.length);
  if (end === -1) return {};
  const parsed = parseYaml(content.slice(SESSION_FRONT_MATTER_OPEN.length, end));
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

export function extractSessionFile(output: string): string {
  const match = /<SESSION_FILE>(.*?)<\/SESSION_FILE>/.exec(output);
  if (!match?.[1]) throw new Error(`No SESSION_FILE tag in handoff output`);
  return match[1];
}
