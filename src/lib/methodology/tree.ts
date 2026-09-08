/**
 * The layout grammar of spx's shipped methodology trees.
 *
 * A tree is addressed by methodology line — the `MAJOR.MINOR` of an exact
 * version, derived by a pure parse — then coding agent, then plugin name, under
 * a tree root the caller supplies. Every function here is pure over its
 * arguments; reads enter their consumers through injected interfaces.
 *
 * @module lib/methodology/tree
 */

import { join } from "node:path";

import { METHODOLOGY_LINE_PATTERN, METHODOLOGY_VERSION_PATTERN } from "@/config/methodology";
import type { Result } from "@/config/types";

/** Package-relative root holding every shipped methodology tree. */
export const METHODOLOGY_TREE_ROOT = "methodology";

/** The plugin whose shipped tree carries the foundation-resource manifest. */
export const FOUNDATION_PLUGIN_NAME = "spec-tree";

/** Line-relative location of the record naming where a line's bytes were fetched from. */
export const SOURCE_RECORD_RELATIVE_PATH = "source.json";

export { METHODOLOGY_LINE_PATTERN, METHODOLOGY_VERSION_PATTERN };

const LINE_SEPARATOR = ".";
const MAJOR_GROUP = 1;
const MINOR_GROUP = 2;
const AVAILABLE_LIST_SEPARATOR = ", ";

export const SOURCE_RECORD_FIELDS = {
  REPOSITORY: "repository",
  REVISION: "revision",
  PLUGINS: "plugins",
  NAME: "name",
  VERSION: "version",
  PROVIDES: "provides",
  SUPPORTS: "supports",
} as const;

/** One coding agent's plugin identity at the fetched revision. */
export interface MethodologySourcePlugin {
  readonly name: string;
  readonly version: string;
  /** The exact methodology version the plugin declares it provides, when declared. */
  readonly provides?: string;
  /** The methodology-version range the plugin declares it supports, when declared. */
  readonly supports?: string;
}

/** What a shipped line records about where its bytes came from. */
export interface MethodologySourceRecord {
  readonly repository: string;
  readonly revision: string;
  readonly plugins: Readonly<Record<string, MethodologySourcePlugin>>;
}

/** Whether `value` is an exact methodology version. */
export function isMethodologyVersion(value: string): boolean {
  return METHODOLOGY_VERSION_PATTERN.test(value);
}

/** Whether `value` is a methodology line, `MAJOR.MINOR`. */
export function isMethodologyLine(value: string): boolean {
  return METHODOLOGY_LINE_PATTERN.test(value);
}

/** Diagnostic for a value that is not an exact methodology version. */
export function formatMethodologyVersionInvalidError(version: string): string {
  return `Methodology version must be an exact MAJOR.MINOR.PATCH version; rejected ${JSON.stringify(version)}`;
}

/** Diagnostic for a value that is not a methodology line. */
export function formatMethodologyLineInvalidError(line: string): string {
  return `Methodology line must be MAJOR.MINOR with no patch component; rejected ${JSON.stringify(line)}`;
}

/** The line of an exact methodology version: its major and minor components. */
export function methodologyLine(version: string): Result<string> {
  const match = METHODOLOGY_VERSION_PATTERN.exec(version);
  if (match === null) {
    return { ok: false, error: formatMethodologyVersionInvalidError(version) };
  }
  return { ok: true, value: [match[MAJOR_GROUP], match[MINOR_GROUP]].join(LINE_SEPARATOR) };
}

/**
 * A path segment is a single, non-traversing name: a line or coding-agent
 * value reaching path composition can originate in product configuration or a
 * fetch argument, so it is constrained before it can widen the addressed
 * location.
 */
export function isPlainSegment(value: string): boolean {
  return value.length > 0
    && !value.includes("/")
    && !value.includes("\\")
    && value !== "."
    && value !== "..";
}

function validateSegments(segments: readonly string[]): Result<undefined> {
  for (const segment of segments) {
    if (!isPlainSegment(segment)) {
      return { ok: false, error: `methodology tree segment must be a plain name; rejected ${JSON.stringify(segment)}` };
    }
  }
  return { ok: true, value: undefined };
}

/** Package-relative directory of one shipped line. */
export function methodologyLineRelativeDir(line: string): Result<string> {
  const segments = validateSegments([line]);
  if (!segments.ok) return segments;
  return { ok: true, value: join(METHODOLOGY_TREE_ROOT, line) };
}

/** Package-relative directory of one shipped tree. */
export function methodologyTreeRelativeDir(
  line: string,
  codingAgent: string,
  plugin: string = FOUNDATION_PLUGIN_NAME,
): Result<string> {
  const segments = validateSegments([line, codingAgent, plugin]);
  if (!segments.ok) return segments;
  return { ok: true, value: join(METHODOLOGY_TREE_ROOT, line, codingAgent, plugin) };
}

/** Absolute directory of one shipped line under the supplied tree root. */
export function methodologyLineDir(treeRoot: string, line: string): Result<string> {
  const segments = validateSegments([line]);
  if (!segments.ok) return segments;
  return { ok: true, value: join(treeRoot, line) };
}

/** Absolute directory of one shipped tree under the supplied tree root. */
export function methodologyTreeDir(
  treeRoot: string,
  line: string,
  codingAgent: string,
  plugin: string = FOUNDATION_PLUGIN_NAME,
): Result<string> {
  const segments = validateSegments([line, codingAgent, plugin]);
  if (!segments.ok) return segments;
  return { ok: true, value: join(treeRoot, line, codingAgent, plugin) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, field: string, path: string): Result<string> {
  const raw = record[field];
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: `${path}.${field} must be a non-empty string` };
  }
  return { ok: true, value: raw };
}

function readOptionalString(record: Record<string, unknown>, field: string, path: string): Result<string | undefined> {
  const raw = record[field];
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, error: `${path}.${field} must be a non-empty string when present` };
  }
  return { ok: true, value: raw };
}

function parseSourcePlugin(raw: unknown, path: string): Result<MethodologySourcePlugin> {
  if (!isRecord(raw)) {
    return { ok: false, error: `${path} must be an object` };
  }
  const name = readRequiredString(raw, SOURCE_RECORD_FIELDS.NAME, path);
  if (!name.ok) return name;
  const version = readRequiredString(raw, SOURCE_RECORD_FIELDS.VERSION, path);
  if (!version.ok) return version;
  const provides = readOptionalString(raw, SOURCE_RECORD_FIELDS.PROVIDES, path);
  if (!provides.ok) return provides;
  const supports = readOptionalString(raw, SOURCE_RECORD_FIELDS.SUPPORTS, path);
  if (!supports.ok) return supports;
  return {
    ok: true,
    value: {
      name: name.value,
      version: version.value,
      ...(provides.value === undefined ? {} : { provides: provides.value }),
      ...(supports.value === undefined ? {} : { supports: supports.value }),
    },
  };
}

/** Parses a source record, rejecting any absent or malformed field by name. */
export function parseMethodologySourceRecord(text: string): Result<MethodologySourceRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "source record is not valid JSON" };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: "source record must be a JSON object" };
  }
  const path = SOURCE_RECORD_RELATIVE_PATH;
  const repository = readRequiredString(parsed, SOURCE_RECORD_FIELDS.REPOSITORY, path);
  if (!repository.ok) return repository;
  const revision = readRequiredString(parsed, SOURCE_RECORD_FIELDS.REVISION, path);
  if (!revision.ok) return revision;
  const pluginsRaw = parsed[SOURCE_RECORD_FIELDS.PLUGINS];
  if (!isRecord(pluginsRaw)) {
    return { ok: false, error: `${path}.${SOURCE_RECORD_FIELDS.PLUGINS} must be an object keyed by coding agent` };
  }
  const plugins: Record<string, MethodologySourcePlugin> = {};
  for (const [codingAgent, raw] of Object.entries(pluginsRaw)) {
    const plugin = parseSourcePlugin(raw, `${path}.${SOURCE_RECORD_FIELDS.PLUGINS}.${codingAgent}`);
    if (!plugin.ok) return plugin;
    plugins[codingAgent] = plugin.value;
  }
  return { ok: true, value: { repository: repository.value, revision: revision.value, plugins } };
}

const SOURCE_RECORD_INDENTATION = 2;

function compareCodeUnitOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonical source-record text: fixed field order, coding agents sorted, two-space indentation, trailing newline. */
export function formatMethodologySourceRecord(record: MethodologySourceRecord): string {
  const plugins = Object.fromEntries(
    Object.keys(record.plugins).sort(compareCodeUnitOrder).map((codingAgent) => {
      const plugin = record.plugins[codingAgent];
      return [codingAgent, {
        [SOURCE_RECORD_FIELDS.NAME]: plugin.name,
        [SOURCE_RECORD_FIELDS.VERSION]: plugin.version,
        ...(plugin.provides === undefined ? {} : { [SOURCE_RECORD_FIELDS.PROVIDES]: plugin.provides }),
        ...(plugin.supports === undefined ? {} : { [SOURCE_RECORD_FIELDS.SUPPORTS]: plugin.supports }),
      }];
    }),
  );
  return `${
    JSON.stringify(
      {
        [SOURCE_RECORD_FIELDS.REPOSITORY]: record.repository,
        [SOURCE_RECORD_FIELDS.REVISION]: record.revision,
        [SOURCE_RECORD_FIELDS.PLUGINS]: plugins,
      },
      null,
      SOURCE_RECORD_INDENTATION,
    )
  }\n`;
}

function formatAvailable(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.join(AVAILABLE_LIST_SEPARATOR);
}

/** Diagnostic for a declared version whose line spx does not ship. */
export function formatMethodologyLineMissingError(
  version: string,
  line: string,
  availableLines: readonly string[],
): string {
  return `spx ships no methodology tree for line ${line} of declared version ${version}`
    + ` (shipped lines: ${formatAvailable(availableLines)})`;
}

/** Diagnostic for a coding agent the shipped line carries no tree for. */
export function formatCodingAgentMissingError(
  line: string,
  codingAgent: string,
  availableAgents: readonly string[],
): string {
  return `spx ships no methodology tree for coding agent ${JSON.stringify(codingAgent)} on line ${line}`
    + ` (shipped coding agents: ${formatAvailable(availableAgents)})`;
}

/** Diagnostic for a read that names no coding agent when the line ships more than one. */
export function formatCodingAgentUnresolvedError(line: string, availableAgents: readonly string[]): string {
  return `Name the coding agent in scope; line ${line} ships trees for: ${formatAvailable(availableAgents)}`;
}

/** Diagnostic for a source record that fails to parse. */
export function formatSourceRecordInvalidError(recordPath: string, detail: string): string {
  return `Methodology source record invalid: ${recordPath} (${detail})`;
}
