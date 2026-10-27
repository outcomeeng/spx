/**
 * Observations of the methodology trees this checkout ships, for tests that
 * run the built executable against its own package: the executable resolves
 * the tree root from its module location, so a test that declares a shipped
 * version reads the same bytes the package carries.
 *
 * @module harnesses/methodology/shipped-tree
 */

import { readFile, stat } from "node:fs/promises";
import { join, posix } from "node:path";

import {
  defaultMethodologyTreeFileSystem,
  FOUNDATION_MANIFEST_FIELDS,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  FOUNDATION_PLUGIN_NAME,
  FOUNDATION_SKILL_DIR_PLACEHOLDERS,
  METHODOLOGY_MIGRATION_ROOT,
  METHODOLOGY_RESOURCE_ENCODING,
  methodologyTreeRelativeDir,
  methodologyTreeRootDir,
  SOURCE_RECORD_FIELDS,
  SOURCE_RECORD_RELATIVE_PATH,
} from "@/lib/methodology";
import { PRODUCT_ROOT } from "@testing/harnesses/constants";

const PATCH_ZERO = ".0";

/** An exact version whose line this checkout ships, with that line. */
export interface ShippedMethodologyVersion {
  readonly text: string;
  readonly line: string;
}

/** Absolute path of this checkout's shipped `methodology/` directory. */
export function shippedMethodologyTreeRoot(): string {
  return methodologyTreeRootDir(PRODUCT_ROOT);
}

/** The first line this checkout ships, as an exact version on that line. */
export async function shippedMethodologyVersion(): Promise<ShippedMethodologyVersion> {
  const line = (await defaultMethodologyTreeFileSystem.readDirectoryNames(shippedMethodologyTreeRoot())).at(0);
  if (line === undefined) throw new Error(`${shippedMethodologyTreeRoot()} ships no methodology line`);
  return { text: `${line}${PATCH_ZERO}`, line };
}

/**
 * The package-relative path of the shipped core resource, located by plain
 * JSON access to the manifest's core field, so the oracle shares no code with
 * the production manifest parser whose output the linked test compares.
 */
async function shippedFoundationCorePath(line: string, codingAgent: string): Promise<string> {
  const treeDir = join(shippedMethodologyTreeRoot(), line, codingAgent, FOUNDATION_PLUGIN_NAME);
  const manifestPath = join(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
  const manifest: unknown = JSON.parse(await readFile(manifestPath, METHODOLOGY_RESOURCE_ENCODING));
  const core = typeof manifest === "object" && manifest !== null
    ? (manifest as Record<string, unknown>)[FOUNDATION_MANIFEST_FIELDS.CORE]
    : undefined;
  if (typeof core !== "string") {
    throw new Error(`${manifestPath} names no ${FOUNDATION_MANIFEST_FIELDS.CORE} resource`);
  }
  return core;
}

/** The exact text of the shipped core foundation resource for one coding agent on a shipped line. */
export async function shippedFoundationCoreText(line: string, codingAgent: string): Promise<string> {
  const treeDir = join(shippedMethodologyTreeRoot(), line, codingAgent, FOUNDATION_PLUGIN_NAME);
  return readFile(join(treeDir, await shippedFoundationCorePath(line, codingAgent)), METHODOLOGY_RESOURCE_ENCODING);
}

/**
 * The core body `show --methodology` delivers: the shipped core after its
 * skill-runtime front matter, with every skill-directory placeholder replaced
 * by the package-relative directory the core ships in. The front-matter split
 * and the replacement are plain scans, independent of the production parsers.
 */
export async function shippedFoundationCoreBody(line: string, codingAgent: string): Promise<string> {
  const text = await shippedFoundationCoreText(line, codingAgent);
  const lines = text.split("\n");
  const closing = lines[0] === "---" ? lines.findIndex((candidate, index) => index > 0 && candidate === "---") : -1;
  const body = closing === -1 ? text : lines.slice(closing + 1).join("\n");
  const skillDirAddress = posix.join(
    shippedTreeRelativeDir(line, codingAgent),
    posix.dirname(await shippedFoundationCorePath(line, codingAgent)),
  );
  return FOUNDATION_SKILL_DIR_PLACEHOLDERS.reduce(
    (resolved, placeholder) => resolved.split(placeholder).join(skillDirAddress),
    body,
  );
}

/**
 * The exact text of the shipped compact-recovery resource for one coding agent
 * on a shipped line, or `undefined` when the shipped manifest names none. The
 * entry is located by plain JSON access, independent of the production parser.
 */
export async function shippedCompactRecoveryText(line: string, codingAgent: string): Promise<string | undefined> {
  const treeDir = join(shippedMethodologyTreeRoot(), line, codingAgent, FOUNDATION_PLUGIN_NAME);
  const manifest: unknown = JSON.parse(
    await readFile(join(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH), METHODOLOGY_RESOURCE_ENCODING),
  );
  const entry = typeof manifest === "object" && manifest !== null
    ? (manifest as Record<string, unknown>)[FOUNDATION_MANIFEST_FIELDS.COMPACT_RECOVERY]
    : undefined;
  if (entry === undefined) return undefined;
  if (typeof entry !== "string") throw new Error(`${treeDir} names a non-string compact-recovery entry`);
  return readFile(join(treeDir, entry), METHODOLOGY_RESOURCE_ENCODING);
}

/** The package-relative directory of one shipped tree, for diagnostics that name it. */
export function shippedTreeRelativeDir(line: string, codingAgent: string): string {
  const relative = methodologyTreeRelativeDir(line, codingAgent);
  if (!relative.ok) throw new Error(relative.error);
  return relative.value;
}

/** What this checkout's shipped `source.json` records for one coding agent's migration, with what the package holds for it. */
export interface ShippedMigrationObservation {
  /** The package-relative directory the entry and instructions belong in: `migration/{line}/{coding-agent}`. */
  readonly directory: string;
  readonly entries: readonly string[];
  readonly instructions: readonly string[];
  /** Whether each recorded path, entry then instruction, names a regular file in the package. */
  readonly recordedFileExists: ReadonlyMap<string, boolean>;
  /** The text of each recorded entry, keyed by its recorded path. */
  readonly entryText: ReadonlyMap<string, string>;
}

/** Plain JSON access to a field of an object value, independent of the production record parser. */
function jsonField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function stringList(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${what} is not a list of strings`);
  }
  return value;
}

async function regularFileExists(absolutePath: string): Promise<boolean> {
  try {
    return (await stat(absolutePath)).isFile();
  } catch {
    return false;
  }
}

/** The package root of this checkout, the parent of its shipped `methodology/` and `migration/` directories. */
export function shippedPackageRoot(): string {
  return PRODUCT_ROOT;
}

/** The lines this checkout ships under `methodology/`. */
export async function shippedMethodologyLines(): Promise<readonly string[]> {
  return defaultMethodologyTreeFileSystem.readDirectoryNames(shippedMethodologyTreeRoot());
}

/**
 * Reads the migration record of one coding agent from the shipped `source.json`
 * by plain JSON access, and observes the package files it names.
 */
export async function shippedMigrationObservation(
  line: string,
  codingAgent: string,
): Promise<ShippedMigrationObservation> {
  const recordPath = join(shippedMethodologyTreeRoot(), line, SOURCE_RECORD_RELATIVE_PATH);
  const record: unknown = JSON.parse(await readFile(recordPath, METHODOLOGY_RESOURCE_ENCODING));
  const migration = jsonField(
    jsonField(jsonField(record, SOURCE_RECORD_FIELDS.PLUGINS), codingAgent),
    SOURCE_RECORD_FIELDS.MIGRATION,
  );
  const entries = stringList(
    jsonField(migration, SOURCE_RECORD_FIELDS.ENTRIES),
    `${recordPath} ${codingAgent} entries`,
  );
  const instructions = stringList(
    jsonField(migration, SOURCE_RECORD_FIELDS.INSTRUCTIONS),
    `${recordPath} ${codingAgent} instructions`,
  );
  const recordedFileExists = new Map<string, boolean>();
  const entryText = new Map<string, string>();
  for (const path of [...entries, ...instructions]) {
    const exists = await regularFileExists(join(PRODUCT_ROOT, path));
    recordedFileExists.set(path, exists);
    if (exists && entries.includes(path)) {
      entryText.set(path, await readFile(join(PRODUCT_ROOT, path), METHODOLOGY_RESOURCE_ENCODING));
    }
  }
  return {
    directory: posix.join(METHODOLOGY_MIGRATION_ROOT, line, codingAgent),
    entries,
    instructions,
    recordedFileExists,
    entryText,
  };
}
