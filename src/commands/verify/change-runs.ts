import { listJournalRuns, readJournalEvents } from "@/commands/journal/runtime";
import { readVerifyRecordedInput, VERIFY_CLI_EXIT_CODE } from "@/commands/verify/cli";
import type { CliCommandResult, Result } from "@/config/types";
import {
  groupChangeRunsByType,
  projectChangeRun,
  runServesChange,
  VERIFY_CHANGE_RUN_TYPES,
  type VerifyChangeRun,
  type VerifyChangeRunsReport,
} from "@/domains/verify/change-runs";
import { isVerifyChangeIdentity, verifyInputRecordPath, type VerifyVerificationType } from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { defaultGitDependencies, detectGitCommonDirProductRoot, type GitDependencies } from "@/lib/git/root";
import { defaultStateStoreFileSystem, type StateStoreFileSystem } from "@/lib/state-store";
import {
  authoredText,
  externalValue,
  jsonDocument,
  renderTerminalText,
  terminal,
} from "@/lib/terminal-text/terminal-text";

export const VERIFY_CHANGE_RUNS_ERROR = {
  CHANGE_IDENTITY_INVALID: "spx verification run list requires a Change identity in the canonical owner/repo#N form",
  LIST_FAILED: "spx verification run list could not read the recorded runs",
} as const;

export interface VerifyChangeRunsCliOptions {
  /** The Change whose runs are listed, in the canonical `owner/repo#N` form. */
  readonly change: string;
}

export interface VerifyChangeRunsDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly fs?: StateStoreFileSystem;
}

/** Every journal run a listing scans: unbounded, since a Change's runs are counted, never sampled. */
const VERIFY_CHANGE_RUNS_SCAN_LIMIT = Number.POSITIVE_INFINITY;

/** A listing failure whose externally-originated cause is escaped where it is embedded. */
function listFailure(error: string): Result<never> {
  const diagnostic = terminal`${authoredText(VERIFY_CHANGE_RUNS_ERROR.LIST_FAILED)}: ${externalValue(error)}`;
  return { ok: false, error: renderTerminalText(diagnostic) };
}

/**
 * List the runs of one verification type that serve the Change, across every branch scope of the
 * store at the Git common-dir product root, projecting each into its listing entry.
 */
async function changeRunsOfType(
  productDir: string,
  verificationType: VerifyVerificationType,
  change: string,
  fs: StateStoreFileSystem,
): Promise<Result<readonly VerifyChangeRun[]>> {
  const runs = await listJournalRuns(
    { productDir, type: verificationType, limit: VERIFY_CHANGE_RUNS_SCAN_LIMIT },
    { fs },
  );
  if (!runs.ok) return listFailure(runs.error);
  const listed: VerifyChangeRun[] = [];
  for (const run of runs.value) {
    const ref = { productDir, branchSlug: run.branchSlug, type: verificationType, runToken: run.runToken };
    const events = await readJournalEvents(ref, JOURNAL_SEQ_BASE, { fs });
    if (!events.ok) return listFailure(events.error);
    if (!runServesChange(events.value, change)) continue;
    const inputPath = verifyInputRecordPath(ref);
    if (!inputPath.ok) return listFailure(inputPath.error);
    const recordedInput = await readVerifyRecordedInput(inputPath.value, fs);
    if (!recordedInput.ok) return listFailure(recordedInput.error);
    listed.push(projectChangeRun({
      runToken: run.runToken,
      verificationType,
      recordedInput: recordedInput.value,
      events: events.value,
    }));
  }
  return { ok: true, value: listed };
}

/**
 * List the verification runs recorded for one Change, grouped by verification type. The listing
 * reads every branch scope of the local store at the Git common-dir product root — whichever
 * branch, worktree, or detached head started a run — and appends nothing to any journal.
 */
export async function verifyChangeRunsCommand(
  options: VerifyChangeRunsCliOptions,
  deps: VerifyChangeRunsDeps,
): Promise<CliCommandResult> {
  if (!isVerifyChangeIdentity(options.change)) {
    return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: VERIFY_CHANGE_RUNS_ERROR.CHANGE_IDENTITY_INVALID };
  }
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  const product = await detectGitCommonDirProductRoot(cwd, deps.git ?? defaultGitDependencies);
  const listed: VerifyChangeRun[] = [];
  for (const verificationType of VERIFY_CHANGE_RUN_TYPES) {
    const runs = await changeRunsOfType(product.productDir, verificationType, options.change, fs);
    if (!runs.ok) return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: runs.error };
    listed.push(...runs.value);
  }
  const report: VerifyChangeRunsReport = { change: options.change, runs: groupChangeRunsByType(listed) };
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, output: renderTerminalText(jsonDocument(report)) };
}
