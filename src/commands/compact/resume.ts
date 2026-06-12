/**
 * `spx compact resume` handler: returns the most recent stash record from the
 * shared `.spx/sessions/<id>/`, or null when none exists.
 *
 * @module commands/compact/resume
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseStashFilenameIndex } from "@/domains/compact";
import type { GitDependencies } from "@/git/root";

import { resolveCompactStashDir } from "./resolve-dir";

const RECORD_ENCODING = "utf-8";

export interface CompactResumeCommandOptions {
  /** The per-conversation runtime id naming the stash directory. */
  readonly sessionId: string;
  /** Working directory for git detection; defaults to the process cwd. */
  readonly cwd?: string;
  /** Injectable git dependencies for testing. */
  readonly deps?: GitDependencies;
}

export interface CompactResumeCommandResult {
  /** Serialized JSON of the most recent record, or null when none exists. */
  readonly output: string | null;
  /** Non-git-repo fallback warning, present only when resolution fell back to the cwd. */
  readonly warning?: string;
}

function resumeResult(output: string | null, warning: string | undefined): CompactResumeCommandResult {
  return warning === undefined ? { output } : { output, warning };
}

function highestStashFilename(filenames: readonly string[]): string | null {
  let best: { readonly index: number; readonly filename: string } | null = null;
  for (const filename of filenames) {
    const index = parseStashFilenameIndex(filename);
    if (index === null) {
      continue;
    }
    if (best === null || index > best.index) {
      best = { index, filename };
    }
  }
  return best?.filename ?? null;
}

/** Returns the most recent stash record's JSON, or null when the directory holds none. */
export async function compactResumeCommand(
  options: CompactResumeCommandOptions,
): Promise<CompactResumeCommandResult> {
  const { dir, warning } = await resolveCompactStashDir({
    sessionId: options.sessionId,
    cwd: options.cwd,
    deps: options.deps,
  });

  let filenames: readonly string[];
  try {
    filenames = await readdir(dir);
  } catch {
    return resumeResult(null, warning);
  }

  const highest = highestStashFilename(filenames);
  if (highest === null) {
    return resumeResult(null, warning);
  }
  return resumeResult(await readFile(join(dir, highest), RECORD_ENCODING), warning);
}
