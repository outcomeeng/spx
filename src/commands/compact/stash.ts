/**
 * `spx compact stash` handler: reads a transcript, and when it carries the
 * foundation marker, writes the next numbered stash record into the shared
 * `.spx/sessions/<id>/`. No-ops without writing when no foundation is present.
 *
 * @module commands/compact/stash
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { extractStashRecord, nextStashIndex, serializeStashRecord, stashRecordFilename } from "@/domains/compact";
import type { GitDependencies } from "@/git/root";

import { resolveCompactStashDir } from "./resolve-dir";

const TRANSCRIPT_ENCODING = "utf-8";

export interface CompactStashCommandOptions {
  /** The per-conversation runtime id naming the stash directory. */
  readonly sessionId: string;
  /** Path to the JSONL transcript to scan for spec-tree markers. */
  readonly transcriptPath: string;
  /** Working directory for git detection; defaults to the process cwd. */
  readonly cwd?: string;
  /** Injectable git dependencies for testing. */
  readonly deps?: GitDependencies;
}

export interface CompactStashCommandResult {
  /** Absolute path of the written record, or null on a no-op (no foundation marker). */
  readonly written: string | null;
  /** Non-git-repo fallback warning, present only when resolution fell back to the cwd. */
  readonly warning?: string;
}

function stashResult(written: string | null, warning: string | undefined): CompactStashCommandResult {
  return warning === undefined ? { written } : { written, warning };
}

/** Writes the next numbered stash record when the transcript carries a foundation marker. */
export async function compactStashCommand(options: CompactStashCommandOptions): Promise<CompactStashCommandResult> {
  const transcript = await readFile(options.transcriptPath, TRANSCRIPT_ENCODING);
  const record = extractStashRecord(transcript);
  if (record === null) {
    return stashResult(null, undefined);
  }

  const { dir, warning } = await resolveCompactStashDir({
    sessionId: options.sessionId,
    cwd: options.cwd,
    deps: options.deps,
  });
  await mkdir(dir, { recursive: true });
  const existing = await readdir(dir);
  const path = join(dir, stashRecordFilename(nextStashIndex(existing)));
  await writeFile(path, serializeStashRecord(record));
  return stashResult(path, warning);
}
