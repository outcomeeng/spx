/**
 * Addressing for the committed methodology plugin trees.
 *
 * A tree is addressed by two values known before any read — the methodology
 * version the product declares and the coding agent in scope — so selection is
 * a direct path composition with no version comparison, range evaluation, or
 * directory search. Path composition here is pure; every read enters its
 * consumer through an injected reader.
 *
 * @module lib/methodology/tree
 */

import { join } from "node:path";

import type { Result } from "@/config/types";

/** Product-relative root holding every committed methodology plugin tree. */
export const METHODOLOGY_TREE_ROOT = "methodology";

/** The plugin whose committed tree carries the foundation-resource manifest. */
export const FOUNDATION_PLUGIN_NAME = "spec-tree";

/** Tree-relative location of the provenance record materialization writes. */
export const PROVENANCE_RELATIVE_PATH = "provenance.json";

export const PROVENANCE_FIELDS = {
  METHODOLOGY_VERSION: "methodologyVersion",
  CODING_AGENT: "codingAgent",
  PLUGIN: "plugin",
  PLUGIN_VERSION: "pluginVersion",
  SOURCE_REPOSITORY: "sourceRepository",
  SOURCE_REVISION: "sourceRevision",
  CONTENT_DIGEST: "contentDigest",
} as const;

/** What a committed tree records about the bytes it holds. */
export interface MethodologyTreeProvenance {
  readonly methodologyVersion: string;
  readonly codingAgent: string;
  readonly plugin: string;
  readonly pluginVersion: string;
  readonly sourceRepository: string;
  readonly sourceRevision: string;
  readonly contentDigest: string;
}

/**
 * A path segment is a single, non-traversing name: a version or coding-agent
 * value reaching path composition can originate in product configuration, so it
 * is constrained before it can widen the addressed location.
 */
function isPlainSegment(value: string): boolean {
  return value.length > 0
    && !value.includes("/")
    && !value.includes("\\")
    && value !== "."
    && value !== "..";
}

/** Product-relative directory of one committed tree. */
export function methodologyTreeRelativeDir(
  methodologyVersion: string,
  codingAgent: string,
  plugin: string = FOUNDATION_PLUGIN_NAME,
): Result<string> {
  for (const segment of [methodologyVersion, codingAgent, plugin]) {
    if (!isPlainSegment(segment)) {
      return { ok: false, error: `methodology tree segment must be a plain name; rejected ${JSON.stringify(segment)}` };
    }
  }
  return { ok: true, value: join(METHODOLOGY_TREE_ROOT, methodologyVersion, codingAgent, plugin) };
}

/** Absolute directory of one committed tree under the resolved product directory. */
export function methodologyTreeDir(
  productDir: string,
  methodologyVersion: string,
  codingAgent: string,
  plugin: string = FOUNDATION_PLUGIN_NAME,
): Result<string> {
  const relative = methodologyTreeRelativeDir(methodologyVersion, codingAgent, plugin);
  if (!relative.ok) return relative;
  return { ok: true, value: join(productDir, relative.value) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a provenance record, rejecting any absent or non-string field. */
export function parseMethodologyTreeProvenance(text: string): Result<MethodologyTreeProvenance> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "provenance record is not valid JSON" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "provenance record must be a JSON object" };
  }
  const values = new Map<string, string>();
  for (const field of Object.values(PROVENANCE_FIELDS)) {
    const raw = parsed[field];
    if (typeof raw !== "string" || raw.length === 0) {
      return { ok: false, error: `provenance record field ${field} must be a non-empty string` };
    }
    values.set(field, raw);
  }
  const read = (field: string): string => values.get(field) ?? "";
  return {
    ok: true,
    value: {
      methodologyVersion: read(PROVENANCE_FIELDS.METHODOLOGY_VERSION),
      codingAgent: read(PROVENANCE_FIELDS.CODING_AGENT),
      plugin: read(PROVENANCE_FIELDS.PLUGIN),
      pluginVersion: read(PROVENANCE_FIELDS.PLUGIN_VERSION),
      sourceRepository: read(PROVENANCE_FIELDS.SOURCE_REPOSITORY),
      sourceRevision: read(PROVENANCE_FIELDS.SOURCE_REVISION),
      contentDigest: read(PROVENANCE_FIELDS.CONTENT_DIGEST),
    },
  };
}

/** Diagnostic for a methodology tree the declared address does not reach. */
export function formatMethodologyTreeMissingError(relativeDir: string): string {
  return `Committed methodology tree not found: ${relativeDir}`
    + ` (materialize it for the declared methodology version and coding agent)`;
}

/** Diagnostic for an understand request that names no coding agent and cannot infer one. */
export function formatCodingAgentUnresolvedError(relativeRoot: string, available: readonly string[]): string {
  return available.length === 0
    ? `No committed methodology tree exists under ${relativeRoot}`
    : `Name the coding agent in scope; committed trees exist for: ${available.join(", ")}`;
}
