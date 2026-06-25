import { SESSION_FRONT_MATTER_CLOSE, SESSION_FRONT_MATTER_OPEN } from "@/domains/session/create";
import { SESSION_OUTPUT_MARKER, type SessionOutputMarker } from "@/domains/session/types";
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

export function extractSessionMarker(output: string, marker: SessionOutputMarker): string {
  const match = new RegExp(`<${marker}>(.*?)</${marker}>`).exec(output);
  if (!match?.[1]) throw new Error(`No ${marker} tag in session output`);
  return match[1];
}

export function extractSessionFile(output: string): string {
  return extractSessionMarker(output, SESSION_OUTPUT_MARKER.SESSION_FILE);
}
