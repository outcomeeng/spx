/**
 * Strict canonical-shape session classifier.
 *
 * Distinct from the tolerant `parseSessionMetadata` reader: where the reader
 * accepts any frontmatter and returns defaults, this classifier throws when the
 * frontmatter does not conform to the declared shape. The archive path uses it
 * to decide whether the non-empty-result contract binds a session.
 *
 * @module session/canonical
 */

import { parse as parseYaml, YAMLParseError } from "yaml";

import { SessionNotCanonicalError } from "./errors";
import { FRONT_MATTER_PATTERN, parseSessionMetadata } from "./list";
import { CANONICAL_REQUIRED_KEYS, SESSION_FRONT_MATTER, type SessionMetadata } from "./types";

/**
 * The keys a canonical session frontmatter may carry — the values of the
 * declared frontmatter shape. Any key outside this set marks the session
 * non-canonical, independent of the YAML library's leniency toward unknown keys.
 */
const CANONICAL_FRONT_MATTER_KEYS: ReadonlySet<string> = new Set(Object.values(SESSION_FRONT_MATTER));

/**
 * Parses a session's content against the canonical frontmatter shape.
 *
 * @param content - Full session file content
 * @returns The canonical session metadata when the frontmatter conforms
 * @throws {SessionNotCanonicalError} When the content has no frontmatter, the
 *   frontmatter YAML cannot be parsed, the frontmatter carries a key outside the
 *   declared shape, or it omits a required handoff key.
 */
export function parseCanonicalSession(content: string): SessionMetadata {
  const match = FRONT_MATTER_PATTERN.exec(content);
  if (!match) {
    throw new SessionNotCanonicalError("no frontmatter");
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch (error) {
    if (error instanceof YAMLParseError) {
      throw new SessionNotCanonicalError("frontmatter is not valid YAML");
    }
    throw error;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SessionNotCanonicalError("frontmatter is not a mapping");
  }

  const keys = Object.keys(parsed as Record<string, unknown>);

  for (const key of keys) {
    if (!CANONICAL_FRONT_MATTER_KEYS.has(key)) {
      throw new SessionNotCanonicalError(`carries a key outside the declared shape: ${key}`);
    }
  }

  for (const required of CANONICAL_REQUIRED_KEYS) {
    if (!keys.includes(required)) {
      throw new SessionNotCanonicalError(`omits the required key: ${required}`);
    }
  }

  return parseSessionMetadata(content);
}
