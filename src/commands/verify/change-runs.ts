import { type JournalRunRef, listJournalRuns, readJournalEvents } from "@/commands/journal/runtime";
import {
  readVerifyRecordedInput,
  VERIFY_CLI_EXIT_CODE,
  VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD,
} from "@/commands/verify/cli";
import type { CliCommandResult, Result } from "@/config/types";
import {
  commonJudgedPaths,
  compareChangeRuns,
  comparedRunOf,
  groupChangeRunsByType,
  projectChangeRun,
  runServesChange,
  VERIFY_CHANGE_RUN_TYPES,
  VERIFY_RUN_COMPARISON_REFUSAL,
  type VerifyChangeRun,
  type VerifyChangeRunsReport,
  type VerifyComparedRun,
  type VerifyRunComparisonRefusal,
} from "@/domains/verify/change-runs";
import { isVerifyChangeIdentity, verifyInputRecordPath, type VerifyVerificationType } from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { readCommitBlobs } from "@/lib/git/commit-files";
import { defaultGitDependencies, detectGitCommonDirProductRoot, type GitDependencies } from "@/lib/git/root";
import {
  branchScopeDir,
  branchScopesDir,
  compareAsciiStrings,
  defaultStateStoreFileSystem,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import {
  authoredText,
  externalValue,
  joinTerminalText,
  jsonDocument,
  renderTerminalText,
  terminal,
  type TerminalText,
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

/** One journal run serving the Change: where it lives, its verification type, and its event history. */
interface ChangeRunRecord {
  readonly ref: JournalRunRef;
  readonly verificationType: VerifyVerificationType;
  readonly events: readonly JournalEvent[];
}

/** The Change's runs and the branch scopes whose verification runs the scan read to find them. */
interface ChangeRunScan {
  readonly records: readonly ChangeRunRecord[];
  /** Every branch scope holding a verification run of a listed type, in ASCII order, deduplicated. */
  readonly branchSlugs: readonly string[];
}

/**
 * Every run that serves the Change, across every verification type and every branch scope of the
 * store at the Git common-dir product root, in registry type order and the journal's run order,
 * beside the branch scopes the scan read. Reads event histories only; appends nothing to any journal.
 */
async function changeRunRecords(
  productDir: string,
  change: string,
  fs: StateStoreFileSystem,
): Promise<Result<ChangeRunScan>> {
  const records: ChangeRunRecord[] = [];
  const branchSlugs = new Set<string>();
  for (const verificationType of VERIFY_CHANGE_RUN_TYPES) {
    const runs = await listJournalRuns(
      { productDir, type: verificationType, limit: VERIFY_CHANGE_RUNS_SCAN_LIMIT },
      { fs },
    );
    if (!runs.ok) return listFailure(runs.error);
    for (const run of runs.value) {
      branchSlugs.add(run.branchSlug);
      const ref = { productDir, branchSlug: run.branchSlug, type: verificationType, runToken: run.runToken };
      const events = await readJournalEvents(ref, JOURNAL_SEQ_BASE, { fs });
      if (!events.ok) return listFailure(events.error);
      if (runServesChange(events.value, change)) records.push({ ref, verificationType, events: events.value });
    }
  }
  return { ok: true, value: { records, branchSlugs: [...branchSlugs].sort(compareAsciiStrings) } };
}

/** Project one of the Change's runs into its listing entry, reading its recorded-input sidecar. */
async function listedChangeRun(record: ChangeRunRecord, fs: StateStoreFileSystem): Promise<Result<VerifyChangeRun>> {
  const inputPath = verifyInputRecordPath(record.ref);
  if (!inputPath.ok) return listFailure(inputPath.error);
  const recordedInput = await readVerifyRecordedInput(inputPath.value, fs);
  if (!recordedInput.ok) return listFailure(recordedInput.error);
  return {
    ok: true,
    value: projectChangeRun({
      runToken: record.ref.runToken,
      verificationType: record.verificationType,
      recordedInput: recordedInput.value,
      events: record.events,
    }),
  };
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
  const records = await changeRunRecords(product.productDir, options.change, fs);
  if (!records.ok) return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: records.error };
  const listed: VerifyChangeRun[] = [];
  for (const record of records.value.records) {
    const run = await listedChangeRun(record, fs);
    if (!run.ok) return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: run.error };
    listed.push(run.value);
  }
  const report: VerifyChangeRunsReport = { change: options.change, runs: groupChangeRunsByType(listed) };
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, output: renderTerminalText(jsonDocument(report)) };
}

export const VERIFY_RUN_COMPARISON_ERROR = {
  CHANGE_IDENTITY_INVALID: "a run comparison requires a Change identity in the canonical owner/repo#N form",
  RUN_NOT_IN_CHANGE: "the Change records no verification run with this run token",
  RUN_AMBIGUOUS: "the Change records more than one verification run with this run token",
  HEAD_COMMIT_ABSENT: "the run records no head commit, so the paths it judged have no content identity",
  BLOBS_UNREADABLE: "git could not read the judged paths at the run's head commit",
  BLOB_ABSENT: "a path both runs judged is not a file at one run's head commit",
  COMPARE_FAILED: "spx verification run comparison could not compare the runs",
} as const;

export interface VerifyRunComparisonCliOptions {
  /** The Change both runs serve, in the canonical `owner/repo#N` form. */
  readonly change: string;
  /** The run token of the earlier run, whose head commit is the comparison's first side. */
  readonly firstRun: string;
  /** The run token of the later run, whose head commit is the comparison's second side. */
  readonly secondRun: string;
}

/** The refusal message each comparison refusal class reports. */
const VERIFY_RUN_COMPARISON_REFUSAL_ERROR: Readonly<Record<VerifyRunComparisonRefusal, string>> = {
  [VERIFY_RUN_COMPARISON_REFUSAL.HEAD_COMMIT_ABSENT]: VERIFY_RUN_COMPARISON_ERROR.HEAD_COMMIT_ABSENT,
  [VERIFY_RUN_COMPARISON_REFUSAL.BLOB_ABSENT]: VERIFY_RUN_COMPARISON_ERROR.BLOB_ABSENT,
};

/** A comparison failure naming the externally-originated run token or path it concerns. */
function comparisonFailure(reason: string, subject: string): CliCommandResult {
  const diagnostic = terminal`${authoredText(VERIFY_RUN_COMPARISON_ERROR.COMPARE_FAILED)}: ${authoredText(reason)}: ${
    externalValue(subject)
  }`;
  return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: renderTerminalText(diagnostic) };
}

/** A comparison failure whose externally-originated store error is escaped where it is embedded. */
function comparisonStoreFailure(error: string): CliCommandResult {
  const diagnostic = terminal`${authoredText(VERIFY_RUN_COMPARISON_ERROR.COMPARE_FAILED)}: ${externalValue(error)}`;
  return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: renderTerminalText(diagnostic) };
}

/** The separator between the branch scope paths a lookup diagnostic names as its searched target. */
const VERIFY_RUN_COMPARISON_TARGET_SEPARATOR = ",";

/** The separator between a lookup diagnostic's summary and each of its selector fields. */
const VERIFY_RUN_COMPARISON_FIELD_SEPARATOR = authoredText(" ");

/**
 * The searched target of a comparison lookup: each branch scope the scan read, or the branch-scope
 * store itself when no scope holds a verification run.
 */
function comparisonSearchedTarget(productDir: string, branchSlugs: readonly string[]): Result<string> {
  if (branchSlugs.length === 0) return { ok: true, value: branchScopesDir(productDir) };
  const scopes: string[] = [];
  for (const branchSlug of branchSlugs) {
    const scope = branchScopeDir(productDir, branchSlug);
    if (!scope.ok) return scope;
    scopes.push(scope.value);
  }
  return { ok: true, value: scopes.join(VERIFY_RUN_COMPARISON_TARGET_SEPARATOR) };
}

/** One selector field of a lookup diagnostic: its source-owned label and the external value it names. */
function lookupField(label: string, value: string): TerminalText {
  return terminal`${authoredText(label)}${externalValue(value)}`;
}

/**
 * A comparison lookup failure naming the requested run token, the Change `--change` names, and the
 * searched target, in the selector-field vocabulary every other existing-run lookup diagnostic uses.
 */
function comparisonLookupFailure(
  reason: string,
  selectors: { readonly runToken: string; readonly change: string; readonly searchedTarget: string },
): CliCommandResult {
  const diagnostic = joinTerminalText(VERIFY_RUN_COMPARISON_FIELD_SEPARATOR, [
    terminal`${authoredText(VERIFY_RUN_COMPARISON_ERROR.COMPARE_FAILED)}: ${authoredText(reason)}`,
    lookupField(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN, selectors.runToken),
    lookupField(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.CHANGE, selectors.change),
    lookupField(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.TARGET, selectors.searchedTarget),
  ]);
  return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: renderTerminalText(diagnostic) };
}

/** Select the one run of the Change that carries the run token, across every type and branch scope. */
function selectChangeRun(
  records: readonly ChangeRunRecord[],
  runToken: string,
): { readonly ok: true; readonly value: ChangeRunRecord } | { readonly ok: false; readonly reason: string } {
  const matches = records.filter((record) => record.ref.runToken === runToken);
  if (matches.length === 0) return { ok: false, reason: VERIFY_RUN_COMPARISON_ERROR.RUN_NOT_IN_CHANGE };
  if (matches.length > 1) return { ok: false, reason: VERIFY_RUN_COMPARISON_ERROR.RUN_AMBIGUOUS };
  return { ok: true, value: matches[0] };
}

/**
 * Compare two runs of one Change by the content of the files both judged. Each run is selected by
 * its run token from the Change's runs across every branch scope of the local store; its head
 * commit and judged paths fold from its event history. Each path both runs judged is reported
 * `changed` when its blob object name at the first run's head commit differs from its blob object
 * name at the second run's head commit and `unchanged` when the two are the same blob. Git derives
 * each blob object name from the commit's tree through the injected git runner, run from the
 * invoking worktree; nothing is stored and no journal is appended to.
 */
export async function verifyRunComparisonCommand(
  options: VerifyRunComparisonCliOptions,
  deps: VerifyChangeRunsDeps,
): Promise<CliCommandResult> {
  if (!isVerifyChangeIdentity(options.change)) {
    return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: VERIFY_RUN_COMPARISON_ERROR.CHANGE_IDENTITY_INVALID };
  }
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  const git = deps.git ?? defaultGitDependencies;
  const product = await detectGitCommonDirProductRoot(cwd, git);
  const records = await changeRunRecords(product.productDir, options.change, fs);
  if (!records.ok) return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: records.error };

  const compared: VerifyComparedRun[] = [];
  for (const runToken of [options.firstRun, options.secondRun]) {
    const selected = selectChangeRun(records.value.records, runToken);
    if (!selected.ok) {
      const searchedTarget = comparisonSearchedTarget(product.productDir, records.value.branchSlugs);
      if (!searchedTarget.ok) return comparisonStoreFailure(searchedTarget.error);
      return comparisonLookupFailure(selected.reason, {
        runToken,
        change: options.change,
        searchedTarget: searchedTarget.value,
      });
    }
    const run = comparedRunOf({
      runToken,
      verificationType: selected.value.verificationType,
      events: selected.value.events,
    });
    if (!run.ok) {
      return comparisonFailure(VERIFY_RUN_COMPARISON_REFUSAL_ERROR[run.rejection.refusal], run.rejection.subject);
    }
    compared.push(run.value);
  }
  const [first, second] = compared;

  const paths = commonJudgedPaths(first, second);
  const firstBlobs = await readCommitBlobs(first.headCommit, paths, product.worktreeRoot, git);
  if (firstBlobs === undefined) return comparisonFailure(VERIFY_RUN_COMPARISON_ERROR.BLOBS_UNREADABLE, first.runToken);
  const secondBlobs = await readCommitBlobs(second.headCommit, paths, product.worktreeRoot, git);
  if (secondBlobs === undefined) {
    return comparisonFailure(VERIFY_RUN_COMPARISON_ERROR.BLOBS_UNREADABLE, second.runToken);
  }

  const comparison = compareChangeRuns({ change: options.change, first, second, firstBlobs, secondBlobs });
  if (!comparison.ok) {
    return comparisonFailure(
      VERIFY_RUN_COMPARISON_REFUSAL_ERROR[comparison.rejection.refusal],
      comparison.rejection.subject,
    );
  }
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, output: renderTerminalText(jsonDocument(comparison.value)) };
}
