/**
 * Reads of spx's shipped methodology trees: selecting the tree a declared
 * version and coding agent address under a supplied tree root, and contained
 * reads of manifest-named resources — a resource path binds a read only when
 * it resolves, through any symbolic link, inside the selected tree. The
 * filesystem enters through an injected interface so consumers verify over
 * temp-directory fixtures shaped like the shipped layout.
 *
 * @module lib/methodology/tree-resource
 */

import { readdir as nodeReaddir, readFile as nodeReadFile, realpath as nodeRealPath } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Result } from "@/config/types";
import { isPathContained } from "@/lib/file-system/pathContainment";

import {
  formatFoundationManifestInvalidError,
  formatFoundationManifestUnreadableError,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  type FoundationResourceManifest,
  parseFoundationResourceManifest,
} from "./foundation-manifest";
import {
  compareCodeUnitOrder,
  formatCodingAgentMissingError,
  formatCodingAgentUnresolvedError,
  formatMethodologyLineMissingError,
  formatSourceRecordInvalidError,
  FOUNDATION_PLUGIN_NAME,
  methodologyLine,
  methodologyLineDir,
  methodologyLineRelativeDir,
  type MethodologySourceRecord,
  methodologyTreeDir,
  methodologyTreeRelativeDir,
  parseMethodologySourceRecord,
  SOURCE_RECORD_RELATIVE_PATH,
} from "./tree";

export const METHODOLOGY_RESOURCE_ENCODING = "utf8";

const NOT_FOUND_ERROR_CODE = "ENOENT";

export interface MethodologyTreeFileSystem {
  realPath(path: string): Promise<string>;
  readFile(path: string): Promise<string>;
  /** Names of the directories directly under `path`, in code-unit order; an absent path reads as empty. */
  readDirectoryNames(path: string): Promise<readonly string[]>;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error
    && (error as { readonly code?: unknown }).code === NOT_FOUND_ERROR_CODE;
}

export const defaultMethodologyTreeFileSystem: MethodologyTreeFileSystem = {
  realPath: nodeRealPath,
  // A strict decode makes a non-UTF-8 resource unreadable instead of emitting
  // replacement characters, and a leading byte-order mark stays in the decoded
  // text, so byte equality holds for everything that resolves.
  readFile: async (path) =>
    new TextDecoder(METHODOLOGY_RESOURCE_ENCODING, { fatal: true, ignoreBOM: true }).decode(await nodeReadFile(path)),
  readDirectoryNames: async (path) => {
    try {
      const entries = await nodeReaddir(path, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(compareCodeUnitOrder);
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  },
};

/** The tree a declared version and coding agent address, with the line's source record when it carries one. */
export interface ResolvedMethodologyTree {
  readonly line: string;
  readonly codingAgent: string;
  /** Absolute directory of the selected tree. */
  readonly treeDir: string;
  /** Package-relative directory of the selected tree, for diagnostics. */
  readonly relativeDir: string;
  readonly sourceRecord: MethodologySourceRecord | undefined;
}

export interface ResolveMethodologyTreeOptions {
  /** Absolute path of spx's `methodology/` directory. */
  readonly treeRoot: string;
  /** The exact methodology version the product declares. */
  readonly version: string;
  /** The coding agent in scope; when absent, the line must ship exactly one. */
  readonly codingAgent: string | undefined;
  readonly fs: MethodologyTreeFileSystem;
}

async function readSourceRecord(
  lineDir: string,
  fs: MethodologyTreeFileSystem,
): Promise<Result<MethodologySourceRecord | undefined>> {
  const recordPath = join(lineDir, SOURCE_RECORD_RELATIVE_PATH);
  let text: string;
  try {
    text = await fs.readFile(recordPath);
  } catch (error) {
    if (isNotFound(error)) return { ok: true, value: undefined };
    return { ok: false, error: formatSourceRecordInvalidError(recordPath, String(error)) };
  }
  const record = parseMethodologySourceRecord(text);
  if (!record.ok) {
    return { ok: false, error: formatSourceRecordInvalidError(recordPath, record.error) };
  }
  return record;
}

/**
 * Selects the shipped tree for the declared version's line and the coding
 * agent in scope: a missing line fails naming the version and the shipped
 * lines, and a missing or unresolvable coding agent fails naming the agents
 * the line ships.
 */
export async function resolveMethodologyTree(
  options: ResolveMethodologyTreeOptions,
): Promise<Result<ResolvedMethodologyTree>> {
  const line = methodologyLine(options.version);
  if (!line.ok) return line;
  const lines = await options.fs.readDirectoryNames(options.treeRoot);
  if (!lines.includes(line.value)) {
    return { ok: false, error: formatMethodologyLineMissingError(options.version, line.value, lines) };
  }
  const lineDir = methodologyLineDir(options.treeRoot, line.value);
  if (!lineDir.ok) return lineDir;
  const agents = await options.fs.readDirectoryNames(lineDir.value);
  let codingAgent = options.codingAgent;
  if (codingAgent === undefined) {
    if (agents.length !== 1) {
      return { ok: false, error: formatCodingAgentUnresolvedError(line.value, agents) };
    }
    codingAgent = agents[0];
  } else if (!agents.includes(codingAgent)) {
    return { ok: false, error: formatCodingAgentMissingError(line.value, codingAgent, agents) };
  }
  const treeDir = methodologyTreeDir(options.treeRoot, line.value, codingAgent, FOUNDATION_PLUGIN_NAME);
  if (!treeDir.ok) return treeDir;
  const relativeDir = methodologyTreeRelativeDir(line.value, codingAgent, FOUNDATION_PLUGIN_NAME);
  if (!relativeDir.ok) return relativeDir;
  const sourceRecord = await readSourceRecord(lineDir.value, options.fs);
  if (!sourceRecord.ok) return sourceRecord;
  return {
    ok: true,
    value: {
      line: line.value,
      codingAgent,
      treeDir: treeDir.value,
      relativeDir: relativeDir.value,
      sourceRecord: sourceRecord.value,
    },
  };
}

/** Package-relative directory of one shipped line, for diagnostics naming it. */
export function methodologyLineLocation(line: string): string {
  const relative = methodologyLineRelativeDir(line);
  return relative.ok ? relative.value : line;
}

/** A resolved foundation-resource manifest: the tree it belongs to, its location, and its validated content. */
export interface ResolvedFoundationManifest {
  readonly treeDir: string;
  readonly manifestPath: string;
  readonly manifest: FoundationResourceManifest;
}

/**
 * Reads and validates the foundation-resource manifest of one shipped tree,
 * with each failure named by its manifest diagnostic.
 */
export async function resolveFoundationManifest(
  treeDir: string,
  fs: MethodologyTreeFileSystem,
): Promise<Result<ResolvedFoundationManifest>> {
  const manifestPath = join(treeDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
  let manifestText: string;
  try {
    manifestText = await fs.readFile(manifestPath);
  } catch {
    return { ok: false, error: formatFoundationManifestUnreadableError(manifestPath) };
  }
  const manifest = parseFoundationResourceManifest(manifestText);
  if (!manifest.ok) {
    return { ok: false, error: formatFoundationManifestInvalidError(manifestPath, manifest.error) };
  }
  return { ok: true, value: { treeDir, manifestPath, manifest: manifest.value } };
}

/**
 * The canonical absolute location of a tree resource, or undefined when the
 * path — before or after resolving symbolic links — escapes the tree or names
 * no existing file.
 */
export async function containedTreeResourcePath(
  treeDir: string,
  resourcePath: string,
  fs: MethodologyTreeFileSystem,
): Promise<string | undefined> {
  if (!isPathContained(treeDir, resourcePath)) return undefined;
  let canonicalRoot: string;
  let canonicalResource: string;
  try {
    canonicalRoot = await fs.realPath(treeDir);
    canonicalResource = await fs.realPath(resolve(treeDir, resourcePath));
  } catch {
    return undefined;
  }
  return isPathContained(canonicalRoot, canonicalResource) ? canonicalResource : undefined;
}
