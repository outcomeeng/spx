import { join } from "node:path";

import type { Result } from "@/config/types";
import {
  foldJournalRunState,
  JOURNAL_RUN_STATE_INCOMPLETE_REASON,
  JOURNAL_RUN_STATE_STATUS,
} from "@/domains/journal/run-state";
import type { JournalEvent } from "@/lib/agent-run-journal";
import {
  branchScopeDir,
  branchScopesDir,
  runFileName,
  runsDir,
  runTokenFromRunFileName,
  validateBranchSlug,
  validateScopeToken,
} from "@/lib/state-store";

/**
 * The inputs that scope one journal run's local persistence path: the Git
 * common-dir product root, the state-store branch slug, the opaque caller-supplied
 * verification-type segment, and the run token identifying the run file.
 */
export interface JournalRunScope {
  /** The Git common-dir product root the `.spx/` store resolves under. */
  readonly productDir: string;
  /** The state-store branch slug the run is scoped to. */
  readonly branchSlug: string;
  /** The opaque verification-type segment; spx names no verification kind. */
  readonly type: string;
  /** The run token identifying this run's append-only journal file. */
  readonly runToken: string;
}

export type JournalRunDirectoryScope = Omit<JournalRunScope, "runToken">;

export const JOURNAL_RUN_SEALED_FILTER = {
  ANY: "any",
  SEALED: "sealed",
  UNSEALED: "unsealed",
} as const;

export const JOURNAL_RUN_TERMINAL_FILTER = {
  ANY: "any",
  APPROVED: JOURNAL_RUN_STATE_STATUS.APPROVED,
  REJECTED: JOURNAL_RUN_STATE_STATUS.REJECTED,
  FAILED: JOURNAL_RUN_STATE_STATUS.FAILED,
  INTERRUPTED: JOURNAL_RUN_STATE_STATUS.INTERRUPTED,
  MISSING_STATE: JOURNAL_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE,
  UNSEALED: JOURNAL_RUN_STATE_INCOMPLETE_REASON.UNSEALED,
  SHAPE_INVALID_STATE: JOURNAL_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE,
} as const;

export type JournalRunSealedFilter = (typeof JOURNAL_RUN_SEALED_FILTER)[keyof typeof JOURNAL_RUN_SEALED_FILTER];
export type JournalRunTerminalFilter = (typeof JOURNAL_RUN_TERMINAL_FILTER)[keyof typeof JOURNAL_RUN_TERMINAL_FILTER];
export type JournalRunTerminalState = Exclude<
  JournalRunTerminalFilter,
  typeof JOURNAL_RUN_TERMINAL_FILTER.ANY
>;

export interface JournalRunListScope {
  readonly productDir: string;
  readonly branchSlug?: string;
  readonly type?: string;
  readonly sealed?: JournalRunSealedFilter;
  readonly terminalState?: JournalRunTerminalFilter;
}

export interface JournalRunMetadata {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly type: string;
  readonly runToken: string;
  readonly runFilePath: string;
  readonly runFileName: string;
  readonly startedAt: string;
  readonly createdAtMs: number;
  readonly sealed: boolean;
  readonly eventCount: number;
  readonly terminalState: JournalRunTerminalState;
}

export interface JournalRunFileNameResult {
  readonly runFileName: string;
  readonly runToken: string;
}

export interface SealedJournalRun {
  readonly runToken: string;
  readonly metadata: JournalRunMetadata;
  readonly events: readonly JournalEvent[];
}

export function journalRunsDir(scope: JournalRunDirectoryScope): Result<string> {
  const branchScope = branchScopeDir(scope.productDir, scope.branchSlug);
  if (!branchScope.ok) return branchScope;
  return runsDir(branchScope.value, scope.type);
}

export function journalBranchScopesDir(productDir: string): string {
  return branchScopesDir(productDir);
}

export function journalRunBranchSlugFromEntry(name: string, isDirectory: boolean): string | undefined {
  if (!isDirectory) return undefined;
  const validated = validateBranchSlug(name);
  return validated.ok ? validated.value : undefined;
}

export function journalRunTypeFromEntry(name: string, isDirectory: boolean): string | undefined {
  if (!isDirectory) return undefined;
  const validated = validateScopeToken(name);
  return validated.ok ? validated.value : undefined;
}

export function journalRunFileNameFromEntry(name: string, isFile: boolean): JournalRunFileNameResult | undefined {
  if (!isFile) return undefined;
  const runToken = runTokenFromRunFileName(name);
  return runToken === undefined ? undefined : { runFileName: name, runToken };
}

export function journalRunTerminalState(
  events: readonly JournalEvent[],
  sealed: boolean,
): JournalRunTerminalState {
  const folded = foldJournalRunState(events, sealed);
  return folded.ok ? folded.value.status : folded.reason;
}

export function journalRunMetadataMatches(scope: JournalRunListScope, metadata: JournalRunMetadata): boolean {
  const sealed = scope.sealed ?? JOURNAL_RUN_SEALED_FILTER.ANY;
  if (sealed === JOURNAL_RUN_SEALED_FILTER.SEALED && !metadata.sealed) return false;
  if (sealed === JOURNAL_RUN_SEALED_FILTER.UNSEALED && metadata.sealed) return false;
  const terminalState = scope.terminalState ?? JOURNAL_RUN_TERMINAL_FILTER.ANY;
  return terminalState === JOURNAL_RUN_TERMINAL_FILTER.ANY || metadata.terminalState === terminalState;
}

/**
 * Compose a journal run's local persistence path,
 * `.spx/branch/<branch-slug>/<type>/runs/run-<run-token>.jsonl`, at the Git
 * common-dir product root. The branch slug, the opaque `<type>` segment, and the
 * run token are validated for path safety by the state-store; an invalid slug,
 * type segment, or run token rejects with the state-store error, never a partial
 * path, so a caller-supplied run token cannot escape the run directory.
 */
export function journalRunFilePath(scope: JournalRunScope): Result<string> {
  const typeRunsDir = journalRunsDir(scope);
  if (!typeRunsDir.ok) return typeRunsDir;
  const runToken = validateScopeToken(scope.runToken);
  if (!runToken.ok) return runToken;
  return { ok: true, value: join(typeRunsDir.value, runFileName(runToken.value)) };
}
