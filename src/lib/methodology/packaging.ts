/**
 * Packaging validation of the spx-owned migration assets a shipped line
 * carries: each coding agent records exactly one migration entry, and every
 * recorded entry and instruction resolves to a regular file directly inside
 * that coding agent's `migration/{MAJOR.MINOR}/{coding-agent}/` directory.
 *
 * @module lib/methodology/packaging
 */

import { join, sep } from "node:path";

import { METHODOLOGY_CODING_AGENTS } from "./coding-agent";
import {
  formatMethodologyVersionName,
  isPlainSegment,
  methodologyMigrationRelativeDir,
  type MethodologySourcePlugin,
  type MethodologySourceRecord,
} from "./tree";

/** The one file-system question packaging validation asks. */
export interface MethodologyPackagingFileSystem {
  /** Whether `path`, absolute, names a regular file; `false` when absent or anything else, never a rejection for an absent path. */
  isFile(path: string): Promise<boolean>;
}

export const PACKAGING_FAILURE_KIND = {
  ABSENT: "absent",
  DUPLICATED: "duplicated",
  UNRESOLVABLE: "unresolvable",
} as const;

export type MethodologyPackagingFailureKind = (typeof PACKAGING_FAILURE_KIND)[keyof typeof PACKAGING_FAILURE_KIND];

export interface MethodologyPackagingFailure {
  readonly line: string;
  readonly codingAgent: string;
  readonly kind: MethodologyPackagingFailureKind;
  readonly path?: string;
  readonly message: string;
}

export type MethodologyPackagingResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failures: readonly MethodologyPackagingFailure[] };

const POSIX_SEPARATOR = "/";
const MESSAGE_SEPARATOR = ": ";

function failure(
  line: string,
  codingAgent: string,
  kind: MethodologyPackagingFailureKind,
  path?: string,
): MethodologyPackagingFailure {
  const subject = `${formatMethodologyVersionName(line)}, coding agent ${codingAgent}`;
  const detail = path === undefined ? `migration entry ${kind}` : `migration file ${kind}: ${path}`;
  return {
    line,
    codingAgent,
    kind,
    ...(path === undefined ? {} : { path }),
    message: `${subject}${MESSAGE_SEPARATOR}${detail}`,
  };
}

/** The file name when `path` sits directly inside `directory` (POSIX-separated, package-relative), otherwise undefined. */
function directFileName(directory: string, path: string): string | undefined {
  const prefix = `${directory.split(sep).join(POSIX_SEPARATOR)}${POSIX_SEPARATOR}`;
  if (!path.startsWith(prefix)) return undefined;
  const name = path.slice(prefix.length);
  return isPlainSegment(name) ? name : undefined;
}

/** Judges every coding agent's migration entry and instructions against the package. */
export async function validateMethodologyPackaging(
  packageRoot: string,
  line: string,
  record: MethodologySourceRecord,
  fs: MethodologyPackagingFileSystem,
): Promise<MethodologyPackagingResult> {
  const failures: MethodologyPackagingFailure[] = [];
  for (const codingAgent of METHODOLOGY_CODING_AGENTS) {
    const plugin = (record.plugins as Readonly<Partial<Record<string, MethodologySourcePlugin>>>)[codingAgent];
    const migration = plugin?.migration;
    const entries = migration?.entries ?? [];
    if (entries.length === 0) {
      failures.push(failure(line, codingAgent, PACKAGING_FAILURE_KIND.ABSENT));
    } else if (entries.length > 1) {
      failures.push(failure(line, codingAgent, PACKAGING_FAILURE_KIND.DUPLICATED, entries[1]));
    }
    const directory = methodologyMigrationRelativeDir(line, codingAgent);
    for (const path of [...entries, ...(migration?.instructions ?? [])]) {
      const resolvable = directory.ok
        && directFileName(directory.value, path) !== undefined
        && await fs.isFile(join(packageRoot, path));
      if (!resolvable) {
        failures.push(failure(line, codingAgent, PACKAGING_FAILURE_KIND.UNRESOLVABLE, path));
      }
    }
  }
  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
