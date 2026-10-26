/**
 * Built-executable harness for the `spx verification run` command paths: runs `node bin/spx.js`
 * against a real Git repository in a temporary directory, so l2 evidence exercises the packaged
 * Commander wiring, standard-input reading, and process exit codes rather than in-process handlers.
 *
 * @module testing/harnesses/verify/built-cli
 */

import { access, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { execa } from "execa";

import { JOURNAL_CLI_ENV } from "@/commands/journal/cli";
import { VERIFY_CLI_EXIT_CODE, type VerifyStartReport, type VerifyStatusReport } from "@/commands/verify/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import {
  VERIFY_EXPECTATIONS_FIELD,
  VERIFY_EXPECTATIONS_SCHEMA_VERSION,
  VERIFY_INPUT_SOURCE,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { VERIFICATION_RUN_CLI_SURFACE, VERIFY_CLI } from "@/interfaces/cli/verify";
import { branchScopesDir, compareAsciiStrings, STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  CHANGE_RUNS_TEST_GENERATOR,
  type ChangeRunsScenario,
  type RunComparisonScenario,
} from "@testing/generators/verify/change-runs";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { CLI_PATH, NODE_EXECUTABLE, PRODUCT_ROOT } from "@testing/harnesses/constants";
import { buildGitTestEnvironment, GIT_TEST_ENVIRONMENT_KEYS } from "@testing/harnesses/git-test-constants";
import { type StartedChangeRun, withChangeRunsRepository } from "@testing/harnesses/verify/change-runs";
import {
  initializeVerifyRepository,
  type RepositoryStateEntry,
  withVerifyHeadCommitRepository,
} from "@testing/harnesses/verify/repository";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

/** The bundle `bin/spx.js` loads; absent until `pnpm run build` produces it. */
const BUILT_CLI_BUNDLE = join(PRODUCT_ROOT, "dist", "cli.js");
const BUILT_CLI_MISSING_EXIT_CODE = 1;
const HEADLESS_RUN_TEMP_PREFIX = "verify-built-headless-run-";
const HEADLESS_RUN_PRODUCT_DIRECTORY = "product";
const EXPECTATIONS_FILE_NAME = "expectations.json";

/** Captured streams and exit code of one built-executable run. */
export interface BuiltVerificationCliRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** The two built-executable runs a `start --change` scenario makes, and the run state `status` reports back. */
export interface BuiltRunStartChangeObservation {
  readonly start: BuiltVerificationCliRun;
  readonly status?: BuiltVerificationCliRun;
  readonly statusReport?: VerifyStatusReport;
}

/** Fail loudly before any scenario runs when the built executable is absent. */
async function requireBuiltCli(): Promise<void> {
  try {
    await access(BUILT_CLI_BUNDLE);
  } catch {
    throw new Error(`built spx executable not found at ${BUILT_CLI_BUNDLE}; run \`pnpm run build\` first`);
  }
}

/**
 * The child environment: the caller's environment cleaned of Git overrides, with the journal bound
 * to the local backend and no branch override, so a CI pull-request environment cannot route the
 * run to a hosted backend or file it under another branch. With `gitDiscoveryCeiling`, git's
 * repository discovery stops before entering that directory, so no repository at or above it is
 * visible to the executable.
 */
function builtCliEnvironment(gitDiscoveryCeiling?: string): NodeJS.ProcessEnv {
  const env = buildGitTestEnvironment();
  delete env[JOURNAL_CLI_ENV.BRANCH];
  return {
    ...env,
    ...(gitDiscoveryCeiling === undefined
      ? {}
      : { [GIT_TEST_ENVIRONMENT_KEYS.CEILING_DIRECTORIES]: gitDiscoveryCeiling }),
    [JOURNAL_CLI_ENV.BACKEND]: JOURNAL_BACKEND.LOCAL,
  };
}

/** The flag spelling of a Commander option expression such as `--run <token>`. */
export function flagOf(optionExpression: string): string {
  const [flag] = optionExpression.split(" ");
  return flag;
}

/**
 * Run `node bin/spx.js verification run <commandPath> <options>` from `cwd`, piping `input` to stdin.
 * With `gitDiscoveryCeiling`, git's repository discovery for the run stops before that directory.
 */
export async function runBuiltVerificationRun(
  cwd: string,
  commandPath: readonly string[],
  options: readonly string[],
  input?: string,
  gitDiscoveryCeiling?: string,
): Promise<BuiltVerificationCliRun> {
  await requireBuiltCli();
  const result = await execa(
    NODE_EXECUTABLE,
    [
      CLI_PATH,
      VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
      VERIFICATION_RUN_CLI_SURFACE.runCommandName,
      ...commandPath,
      ...options,
    ],
    { cwd, env: builtCliEnvironment(gitDiscoveryCeiling), extendEnv: false, input: input ?? "", reject: false },
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? BUILT_CLI_MISSING_EXIT_CODE,
  };
}

/** Every file under the store's branch scopes, keyed by its path relative to `.spx/branch/`, with its content. */
export type BuiltRunStoreSnapshot = Readonly<Record<string, string>>;

/**
 * The built-executable runs a `run list` observation makes — the `start --change` that records a
 * run, then the `list` itself — with the store's branch scopes captured immediately before and
 * after `list`, so a test reads what the listing printed and whether it changed the store.
 */
export interface BuiltRunListObservation {
  readonly start: BuiltVerificationCliRun;
  readonly startReport?: VerifyStartReport;
  readonly list?: BuiltVerificationCliRun;
  readonly storeBeforeList?: BuiltRunStoreSnapshot;
  readonly storeAfterList?: BuiltRunStoreSnapshot;
}

/** Read every file under the branch scopes of the store at `productDir`, keyed by its scope-relative path. */
async function readBranchScopesSnapshot(productDir: string): Promise<BuiltRunStoreSnapshot> {
  const root = branchScopesDir(productDir);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort(compareAsciiStrings);
  const snapshot: Record<string, string> = {};
  for (const file of files) {
    snapshot[relative(root, file)] = await readFile(file, STATE_STORE_TEXT_ENCODING);
  }
  return snapshot;
}

/** The product directory and the base and head commits a changeset-scoped run names. */
interface ChangesetRunRepository {
  readonly productDir: string;
  readonly baseCommit: string;
  readonly headCommit: string;
}

/** The selectors of a changeset-scoped review run over the repository's base and head commits. */
function changesetReviewSelectors(repository: ChangesetRunRepository): readonly string[] {
  return [
    flagOf(VERIFY_CLI.verificationTypeOption),
    VERIFY_VERIFICATION_TYPE.REVIEW,
    flagOf(VERIFY_CLI.scopeTypeOption),
    VERIFY_SCOPE_TYPE.CHANGESET,
    flagOf(VERIFY_CLI.scopeOption),
    `${repository.baseCommit}${VERIFY_SCOPE_SEPARATOR}${repository.headCommit}`,
  ];
}

/** The selectors of a file-scoped review run over the product-relative `filePath`. */
function fileReviewSelectors(filePath: string): readonly string[] {
  return [
    flagOf(VERIFY_CLI.verificationTypeOption),
    VERIFY_VERIFICATION_TYPE.REVIEW,
    flagOf(VERIFY_CLI.scopeTypeOption),
    VERIFY_SCOPE_TYPE.FILE,
    flagOf(VERIFY_CLI.scopeOption),
    filePath,
  ];
}

/**
 * Run the built `start` from `cwd` with `selectors`, `--change <change>`, and generated input on
 * stdin, with git's repository discovery bounded at `gitDiscoveryCeiling` when given.
 */
async function startBuiltRunWithChange(
  cwd: string,
  selectors: readonly string[],
  change: string,
  gitDiscoveryCeiling?: string,
): Promise<BuiltVerificationCliRun> {
  const input = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload()));
  return runBuiltVerificationRun(
    cwd,
    [VERIFY_CLI.startCommandName],
    [...selectors, flagOf(VERIFY_CLI.inputOption), VERIFY_INPUT_SOURCE.STDIN, flagOf(VERIFY_CLI.changeOption), change],
    input,
    gitDiscoveryCeiling,
  );
}

/** Run the built `start` for a changeset-scoped review run with `--change <change>` and generated input on stdin. */
async function startBuiltChangeRun(
  repository: ChangesetRunRepository,
  change: string,
  gitDiscoveryCeiling?: string,
): Promise<BuiltVerificationCliRun> {
  return startBuiltRunWithChange(
    repository.productDir,
    changesetReviewSelectors(repository),
    change,
    gitDiscoveryCeiling,
  );
}

/** The report a successful built `start` printed; a failed `start` is a setup failure. */
function startedRunReport(start: BuiltVerificationCliRun, operation: string): VerifyStartReport {
  if (start.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`built-cli harness: ${operation} failed: ${start.stderr}`);
  }
  return JSON.parse(start.stdout) as VerifyStartReport;
}

/**
 * In a real Git repository, run the built `start --change <change>` — leaving the run unsealed — then,
 * when it succeeds, capture the store's branch scopes, run the built `list` with `listOptions`, and
 * capture the branch scopes again.
 */
async function observeBuiltRunList(
  change: string,
  listOptions: readonly string[],
): Promise<BuiltRunListObservation> {
  const scenario = sampleVerifyTestValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
  return withChangeRunsRepository(scenario, async (repository) => {
    const start = await startBuiltChangeRun(repository, change);
    if (start.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return { start };
    const startReport = JSON.parse(start.stdout) as VerifyStartReport;
    const storeBeforeList = await readBranchScopesSnapshot(repository.productDir);
    const list = await runBuiltVerificationRun(repository.productDir, [VERIFY_CLI.listCommandName], listOptions);
    const storeAfterList = await readBranchScopesSnapshot(repository.productDir);
    return { start, startReport, list, storeBeforeList, storeAfterList };
  });
}

/**
 * Start a run with the built `spx verification run start --change <change>`, then run the built
 * `spx verification run list --change <change>` against the same store.
 */
export async function observeBuiltRunListForChange(change: string): Promise<BuiltRunListObservation> {
  return observeBuiltRunList(change, [flagOf(VERIFY_CLI.changeOption), change]);
}

/**
 * Start a run with the built `spx verification run start --change <change>`, so the store holds a
 * run, then run the built `spx verification run list` with no option at all.
 */
export async function observeBuiltRunListWithoutChange(change: string): Promise<BuiltRunListObservation> {
  return observeBuiltRunList(change, []);
}

/**
 * The arrangement and built-executable run a `run compare` observation makes: the commit adding the
 * comparison's files and the commit revising one of them, the two runs started for those commits,
 * and the built `compare --change <change>` naming both runs, with the store's branch scopes —
 * every file under `storeRoot`, the store's branch-scope directory — captured immediately before
 * and after `compare`.
 */
export interface BuiltRunComparisonObservation {
  readonly firstHead: string;
  readonly secondHead: string;
  readonly firstRun: StartedChangeRun;
  readonly secondRun: StartedChangeRun;
  readonly compare: BuiltVerificationCliRun;
  readonly storeRoot: string;
  readonly storeBeforeCompare: BuiltRunStoreSnapshot;
  readonly storeAfterCompare: BuiltRunStoreSnapshot;
}

/** The Change each compared run serves when started; an undefined Change starts a run serving none. */
interface ComparedRunChanges {
  readonly firstRunChange: string | undefined;
  readonly secondRunChange: string | undefined;
}

/**
 * In a real Git repository, commit the comparison's files, then commit its revision of one of them;
 * start a changeset-scoped review run ending at each commit — each serving the Change `changes`
 * names for it, or no Change when that is undefined — and record each run's judged paths through
 * the production `scope add`, leaving both runs unsealed. Then capture the store's branch scopes,
 * run the built `spx verification run compare --change <change>` naming the scenario's Change with
 * the two run tokens in start order, and capture the branch scopes again.
 */
async function observeBuiltRunComparison(
  scenario: ChangeRunsScenario,
  comparison: RunComparisonScenario,
  changes: ComparedRunChanges,
): Promise<BuiltRunComparisonObservation> {
  const verificationType = VERIFY_VERIFICATION_TYPE.REVIEW;
  return withChangeRunsRepository(scenario, async (repository) => {
    const firstHead = await repository.commitFiles(comparison.files);
    const secondHead = await repository.commitFiles([comparison.revision]);
    const firstRun = await repository.startRun({
      verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      ...(changes.firstRunChange === undefined ? {} : { change: changes.firstRunChange }),
      changesetHead: firstHead,
    });
    await repository.appendScope(
      firstRun,
      sampleGeneratedValue(
        VERIFY_TEST_GENERATOR.judgedScopeUnit(verificationType, firstRun.scope, comparison.firstJudgedPaths),
      ),
    );
    const secondRun = await repository.startRun({
      verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      ...(changes.secondRunChange === undefined ? {} : { change: changes.secondRunChange }),
      changesetHead: secondHead,
    });
    await repository.appendScope(
      secondRun,
      sampleGeneratedValue(
        VERIFY_TEST_GENERATOR.judgedScopeUnit(verificationType, secondRun.scope, comparison.secondJudgedPaths),
      ),
    );
    const storeBeforeCompare = await readBranchScopesSnapshot(repository.productDir);
    const compare = await runBuiltVerificationRun(
      repository.productDir,
      [VERIFY_CLI.compareCommandName],
      [
        flagOf(VERIFY_CLI.changeOption),
        scenario.change,
        flagOf(VERIFY_CLI.runOption),
        firstRun.runToken,
        flagOf(VERIFY_CLI.runOption),
        secondRun.runToken,
      ],
    );
    const storeAfterCompare = await readBranchScopesSnapshot(repository.productDir);
    return {
      firstHead,
      secondHead,
      firstRun,
      secondRun,
      compare,
      storeRoot: branchScopesDir(repository.productDir),
      storeBeforeCompare,
      storeAfterCompare,
    };
  });
}

/** Compare, through the built executable, two runs that both serve the scenario's Change. */
export async function observeBuiltRunComparisonOfChange(
  scenario: ChangeRunsScenario,
  comparison: RunComparisonScenario,
): Promise<BuiltRunComparisonObservation> {
  return observeBuiltRunComparison(scenario, comparison, {
    firstRunChange: scenario.change,
    secondRunChange: scenario.change,
  });
}

/**
 * Compare, through the built executable and under the scenario's Change, a run of that Change and a
 * second run that serves the scenario's other Change.
 */
export async function observeBuiltRunComparisonAcrossChanges(
  scenario: ChangeRunsScenario,
  comparison: RunComparisonScenario,
): Promise<BuiltRunComparisonObservation> {
  return observeBuiltRunComparison(scenario, comparison, {
    firstRunChange: scenario.change,
    secondRunChange: scenario.otherChange,
  });
}

/**
 * Compare, through the built executable and under the scenario's Change, a run of that Change and a
 * second run that serves no Change.
 */
export async function observeBuiltRunComparisonWithChangelessRun(
  scenario: ChangeRunsScenario,
  comparison: RunComparisonScenario,
): Promise<BuiltRunComparisonObservation> {
  return observeBuiltRunComparison(scenario, comparison, {
    firstRunChange: scenario.change,
    secondRunChange: undefined,
  });
}

/**
 * Compare, through the built executable and under the scenario's Change, a first run that serves
 * the scenario's other Change and a second run of the scenario's Change.
 */
export async function observeBuiltRunComparisonFirstAcrossChanges(
  scenario: ChangeRunsScenario,
  comparison: RunComparisonScenario,
): Promise<BuiltRunComparisonObservation> {
  return observeBuiltRunComparison(scenario, comparison, {
    firstRunChange: scenario.otherChange,
    secondRunChange: scenario.change,
  });
}

/**
 * Compare, through the built executable and under the scenario's Change, a first run that serves
 * no Change and a second run of the scenario's Change.
 */
export async function observeBuiltRunComparisonFirstChangeless(
  scenario: ChangeRunsScenario,
  comparison: RunComparisonScenario,
): Promise<BuiltRunComparisonObservation> {
  return observeBuiltRunComparison(scenario, comparison, {
    firstRunChange: undefined,
    secondRunChange: scenario.change,
  });
}

/**
 * The arrangement and built-executable run a comparison naming a run without a head commit makes:
 * the start reports of the run that recorded a head commit and of the run that recorded none — both
 * serving the scenario's Change — and the built `compare --change <change>` naming the first, then
 * the second, with the store's branch scopes captured immediately before and after `compare`.
 */
export interface BuiltHeadlessRunComparisonObservation {
  readonly firstRun: VerifyStartReport;
  readonly secondRun: VerifyStartReport;
  readonly compare: BuiltVerificationCliRun;
  readonly storeBeforeCompare: BuiltRunStoreSnapshot;
  readonly storeAfterCompare: BuiltRunStoreSnapshot;
}

/**
 * In a temporary directory that no Git repository encloses — git's repository discovery bounded at
 * its parent — run the built `start --change <change>` for a file-scoped review run on the scenario's
 * file, so the run opens outside any repository and records no head commit. Then make the directory
 * a real Git repository with a base and a head commit adding that file, and run the built
 * `start --change <change>` for a changeset-scoped review run over those commits, so the run records
 * the head commit. Both runs live in the one store at the directory, which is the Git common-dir
 * product root once the repository exists. Capture the store's branch scopes, run the built
 * `spx verification run compare --change <change>` naming the run with a head commit first and the
 * run without one second, and capture the branch scopes again.
 */
export async function observeBuiltRunComparisonWithHeadlessRun(
  scenario: ChangeRunsScenario,
): Promise<BuiltHeadlessRunComparisonObservation> {
  return withTempDir(HEADLESS_RUN_TEMP_PREFIX, async (tempDir) => {
    const root = await realpath(tempDir);
    const productDir = join(root, HEADLESS_RUN_PRODUCT_DIRECTORY);
    await mkdir(productDir);
    const secondRun = startedRunReport(
      await startBuiltRunWithChange(productDir, fileReviewSelectors(scenario.filePath), scenario.change, root),
      "file-scoped start outside a repository",
    );
    const commits = await initializeVerifyRepository(productDir, scenario.filePath);
    const firstRun = startedRunReport(
      await startBuiltChangeRun({ productDir, ...commits }, scenario.change, root),
      "changeset-scoped start in the repository",
    );
    const storeBeforeCompare = await readBranchScopesSnapshot(productDir);
    const compare = await runBuiltVerificationRun(
      productDir,
      [VERIFY_CLI.compareCommandName],
      [
        flagOf(VERIFY_CLI.changeOption),
        scenario.change,
        flagOf(VERIFY_CLI.runOption),
        firstRun.runToken,
        flagOf(VERIFY_CLI.runOption),
        secondRun.runToken,
      ],
      undefined,
      root,
    );
    const storeAfterCompare = await readBranchScopesSnapshot(productDir);
    return { firstRun, secondRun, compare, storeBeforeCompare, storeAfterCompare };
  });
}

/**
 * In a real Git repository with a base and a head commit, run the built `spx verification run start`
 * for a changeset-scoped review run with `--change <change>` and generated input on stdin, then — when
 * `start` succeeds — the built `spx verification run status` for the run token it reported.
 */
export async function observeBuiltRunStartChange(change: string): Promise<BuiltRunStartChangeObservation> {
  const scenario = sampleVerifyTestValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
  return withChangeRunsRepository(scenario, async (repository) => {
    const selectors = changesetReviewSelectors(repository);
    const start = await startBuiltChangeRun(repository, change);
    if (start.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return { start };
    const { runToken } = JSON.parse(start.stdout) as VerifyStartReport;
    const status = await runBuiltVerificationRun(
      repository.productDir,
      [VERIFY_CLI.statusCommandName],
      [...selectors, flagOf(VERIFY_CLI.runOption), runToken],
    );
    if (status.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return { start, status };
    return { start, status, statusReport: JSON.parse(status.stdout) as VerifyStatusReport };
  });
}

/** Which option an `spx verification run paths` invocation leaves out, and which extra option it carries. */
export interface BuiltRunPathsInvocationShape {
  /** The option expression of a required option the invocation omits. */
  readonly omit?: string;
  /** The option expression of an extra option the invocation carries with a generated value. */
  readonly extra?: string;
}

/**
 * The built `paths` run over a real Git repository's file scope, and the checkout's files and
 * directories immediately before and after the built run, so a test reads what the command printed
 * and whether it wrote anything.
 */
export interface BuiltRunPathsObservation {
  readonly run: BuiltVerificationCliRun;
  readonly stateBefore: readonly RepositoryStateEntry[];
  readonly stateAfter: readonly RepositoryStateEntry[];
}

/**
 * In a real Git repository with a base and a head commit, run the built
 * `spx verification run paths` for a file scope of a drawn verification type, leaving out the
 * required option and adding the extra option `shape` names, with the checkout's state captured
 * immediately before and after the run.
 */
export async function observeBuiltRunPaths(
  shape: BuiltRunPathsInvocationShape = {},
): Promise<BuiltRunPathsObservation> {
  const verificationType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verificationType());
  return withVerifyHeadCommitRepository(async (repository) => {
    const selectorOptions: ReadonlyArray<readonly [string, string]> = [
      [VERIFY_CLI.verificationTypeOption, verificationType],
      [VERIFY_CLI.scopeTypeOption, VERIFY_SCOPE_TYPE.FILE],
      [VERIFY_CLI.scopeOption, repository.filePath],
    ];
    const extraOptions: ReadonlyArray<readonly [string, string]> = shape.extra === undefined
      ? []
      : [[shape.extra, sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changeIdentity())]];
    const options = [...selectorOptions, ...extraOptions]
      .filter(([expression]) => expression !== shape.omit)
      .flatMap(([expression, value]) => [flagOf(expression), value]);
    const stateBefore = await repository.snapshotState();
    const run = await runBuiltVerificationRun(repository.productDir, [VERIFY_CLI.pathsCommandName], options);
    const stateAfter = await repository.snapshotState();
    return { run, stateBefore, stateAfter };
  });
}

/**
 * The built `paths` run for a file scope, then the built `start` for the same verification type,
 * scope, and branch in the same repository: the file scope and verification type both ran with, the
 * built runs' outputs, and the checkout's files and directories before `paths`, after `paths`, and
 * after `start`, so a test compares the reported directories with the ones `start` actually creates.
 */
export interface BuiltRunPathsAgainstStartObservation {
  readonly filePath: string;
  readonly verificationType: string;
  readonly paths: BuiltVerificationCliRun;
  readonly start: BuiltVerificationCliRun;
  readonly stateBeforePaths: readonly RepositoryStateEntry[];
  readonly stateAfterPaths: readonly RepositoryStateEntry[];
  readonly stateAfterStart: readonly RepositoryStateEntry[];
}

/**
 * In a real Git repository with a base and a head commit, run the built `spx verification run paths`
 * for a file scope of a drawn verification type, then the built `spx verification run start` for the
 * same type and scope with generated input on stdin, capturing the checkout's state before `paths`,
 * after `paths`, and after `start`.
 */
export async function observeBuiltRunPathsAgainstStart(): Promise<BuiltRunPathsAgainstStartObservation> {
  const verificationType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verificationType());
  return withVerifyHeadCommitRepository(async (repository) => {
    const selectors = [
      flagOf(VERIFY_CLI.verificationTypeOption),
      verificationType,
      flagOf(VERIFY_CLI.scopeTypeOption),
      VERIFY_SCOPE_TYPE.FILE,
      flagOf(VERIFY_CLI.scopeOption),
      repository.filePath,
    ];
    const input = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload()));
    const stateBeforePaths = await repository.snapshotState();
    const paths = await runBuiltVerificationRun(repository.productDir, [VERIFY_CLI.pathsCommandName], selectors);
    const stateAfterPaths = await repository.snapshotState();
    const start = await runBuiltVerificationRun(
      repository.productDir,
      [VERIFY_CLI.startCommandName],
      [...selectors, flagOf(VERIFY_CLI.inputOption), VERIFY_INPUT_SOURCE.STDIN],
      input,
    );
    const stateAfterStart = await repository.snapshotState();
    return {
      filePath: repository.filePath,
      verificationType,
      paths,
      start,
      stateBeforePaths,
      stateAfterPaths,
      stateAfterStart,
    };
  });
}

/** How much of the changeset a bound run's scope evidence judges. */
export const BUILT_RUN_COVERAGE = {
  EVERY_CHANGED_PATH: "every-changed-path",
  ALL_BUT_ONE_CHANGED_PATH: "all-but-one-changed-path",
} as const;

export type BuiltRunCoverage = (typeof BUILT_RUN_COVERAGE)[keyof typeof BUILT_RUN_COVERAGE];

/**
 * An expectations-bound changeset run started and given scope evidence through the built
 * executable: the command-line selectors that address it, the path the evidence leaves unjudged
 * when coverage is all-but-one, the terminal status its evidence accepts, and the captured `start`
 * and `scope add` runs.
 */
export interface BuiltBoundRun {
  readonly productDir: string;
  readonly unaccountedPath: string;
  readonly terminalStatus: string;
  readonly expectationsFile: string;
  readonly selectors: readonly string[];
  readonly runSelectors: readonly string[];
  readonly start: BuiltVerificationCliRun;
  readonly scopeAdd?: BuiltVerificationCliRun;
}

/**
 * In a real Git repository whose changeset changes several paths, start a changeset-scoped review
 * run through the built `start --expectations <file>` and record scope evidence through the built
 * `scope add` that judges the paths `coverage` names, then hand the callback the run. The
 * repository is removed when the callback settles.
 */
async function withBuiltBoundRun<T>(
  coverage: BuiltRunCoverage,
  callback: (run: BuiltBoundRun) => Promise<T>,
): Promise<T> {
  const scenario = sampleVerifyTestValue(CHANGE_RUNS_TEST_GENERATOR.scenario());
  const comparison = sampleVerifyTestValue(CHANGE_RUNS_TEST_GENERATOR.runComparison());
  const idempotencyKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.argvIdempotencyKey());
  const unaccountedPath = comparison.secondOnlyPath;
  return withChangeRunsRepository(scenario, async (repository) => {
    const headCommit = await repository.commitFiles(comparison.files);
    const changedPaths = [repository.filePath, ...comparison.files.map((file) => file.path)];
    const judgedPaths = coverage === BUILT_RUN_COVERAGE.EVERY_CHANGED_PATH
      ? changedPaths
      : changedPaths.filter((path) => path !== unaccountedPath);
    const selectors = changesetReviewSelectors({
      productDir: repository.productDir,
      baseCommit: repository.baseCommit,
      headCommit,
    });
    const scopeIdentity = `${repository.baseCommit}${VERIFY_SCOPE_SEPARATOR}${headCommit}`;
    const evidence = sampleVerifyTestValue(
      VERIFY_TEST_GENERATOR.judgedEvidenceTerminalCase(VERIFY_VERIFICATION_TYPE.REVIEW, scopeIdentity, judgedPaths),
    );
    const expectationsFile = join(dirname(repository.productDir), EXPECTATIONS_FILE_NAME);
    await writeFile(
      expectationsFile,
      JSON.stringify({ [VERIFY_EXPECTATIONS_FIELD.SCHEMA_VERSION]: VERIFY_EXPECTATIONS_SCHEMA_VERSION }),
    );
    const start = await runBuiltVerificationRun(
      repository.productDir,
      [VERIFY_CLI.startCommandName],
      [
        ...selectors,
        flagOf(VERIFY_CLI.inputOption),
        VERIFY_INPUT_SOURCE.STDIN,
        flagOf(VERIFY_CLI.expectationsOption),
        expectationsFile,
      ],
      JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload())),
    );
    const common = {
      productDir: repository.productDir,
      unaccountedPath,
      terminalStatus: evidence.terminalStatus,
      expectationsFile,
      selectors,
    };
    if (start.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return callback({ ...common, runSelectors: selectors, start });
    const runSelectors = [
      ...selectors,
      flagOf(VERIFY_CLI.runOption),
      (JSON.parse(start.stdout) as VerifyStartReport).runToken,
    ];
    const scopeAdd = await runBuiltVerificationRun(
      repository.productDir,
      [VERIFY_CLI.scopeCommandName, VERIFY_CLI.addCommandName],
      [
        ...runSelectors,
        flagOf(VERIFY_CLI.payloadOption),
        VERIFY_INPUT_SOURCE.STDIN,
        flagOf(VERIFY_CLI.idempotencyKeyOption),
        idempotencyKey,
      ],
      JSON.stringify(evidence.payload),
    );
    return callback({ ...common, runSelectors, start, scopeAdd });
  });
}

/** Throw a setup failure unless the bound run's `start` and `scope add` both succeeded. */
function requireBoundRunEvidence(run: BuiltBoundRun): void {
  if (run.start.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`built-cli harness: bound-run start failed: ${run.start.stderr}`);
  }
  if (run.scopeAdd?.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`built-cli harness: bound-run scope add failed: ${run.scopeAdd?.stderr}`);
  }
}

/** The built `reconcile`, and then `finish`, `status` runs over a bound run whose evidence leaves one path unjudged. */
export interface BuiltUnaccountedRunObservation {
  readonly unaccountedPath: string;
  readonly reconcile: BuiltVerificationCliRun;
  readonly finish: BuiltVerificationCliRun;
  readonly status: BuiltVerificationCliRun;
  readonly statusReport: VerifyStatusReport;
}

/**
 * Over an expectations-bound changeset run whose scope evidence judges every changed path but one,
 * run the built `reconcile`, the built `finish` with a terminal status the evidence accepts, and
 * the built `status`.
 */
export async function observeBuiltUnaccountedRun(): Promise<BuiltUnaccountedRunObservation> {
  return withBuiltBoundRun(BUILT_RUN_COVERAGE.ALL_BUT_ONE_CHANGED_PATH, async (run) => {
    requireBoundRunEvidence(run);
    const reconcile = await runBuiltVerificationRun(
      run.productDir,
      [VERIFY_CLI.reconcileCommandName],
      run.runSelectors,
    );
    const finish = await runBuiltVerificationRun(
      run.productDir,
      [VERIFY_CLI.finishCommandName],
      [...run.runSelectors, flagOf(VERIFY_CLI.terminalStatusOption), run.terminalStatus],
    );
    const status = await runBuiltVerificationRun(run.productDir, [VERIFY_CLI.statusCommandName], run.runSelectors);
    return {
      unaccountedPath: run.unaccountedPath,
      reconcile,
      finish,
      status,
      statusReport: JSON.parse(status.stdout) as VerifyStatusReport,
    };
  });
}

/**
 * The built invocations of the option-grammar observation over an expectations-bound run: the
 * accepted `start --expectations`, the `reconcile` and `finish` invocations that name
 * `--expectations`, and the `status` read after them.
 */
export interface BuiltExpectationsOptionObservation {
  readonly start: BuiltVerificationCliRun;
  readonly reconcileWithExpectations: BuiltVerificationCliRun;
  readonly finishWithExpectations: BuiltVerificationCliRun;
  readonly status: BuiltVerificationCliRun;
  readonly statusReport: VerifyStatusReport;
}

/**
 * Over an expectations-bound changeset run, run the built `reconcile` and `finish` each with
 * `--expectations <file>` added to otherwise valid arguments, then the built `status`.
 */
export async function observeBuiltExpectationsOption(): Promise<BuiltExpectationsOptionObservation> {
  return withBuiltBoundRun(BUILT_RUN_COVERAGE.EVERY_CHANGED_PATH, async (run) => {
    requireBoundRunEvidence(run);
    const expectationsFlag = flagOf(VERIFY_CLI.expectationsOption);
    const reconcileWithExpectations = await runBuiltVerificationRun(
      run.productDir,
      [VERIFY_CLI.reconcileCommandName],
      [...run.runSelectors, expectationsFlag, run.expectationsFile],
    );
    const finishWithExpectations = await runBuiltVerificationRun(
      run.productDir,
      [VERIFY_CLI.finishCommandName],
      [
        ...run.runSelectors,
        flagOf(VERIFY_CLI.terminalStatusOption),
        run.terminalStatus,
        expectationsFlag,
        run.expectationsFile,
      ],
    );
    const status = await runBuiltVerificationRun(run.productDir, [VERIFY_CLI.statusCommandName], run.runSelectors);
    return {
      start: run.start,
      reconcileWithExpectations,
      finishWithExpectations,
      status,
      statusReport: JSON.parse(status.stdout) as VerifyStatusReport,
    };
  });
}

/**
 * The built `reconcile` invocations over one expectations-bound run: with every changed path
 * judged and the run named, without `--run`, and with a fresh `--input`.
 */
export interface BuiltReconcileInvocationObservation {
  readonly reconciled: BuiltVerificationCliRun;
  readonly withoutRun: BuiltVerificationCliRun;
  readonly withInput: BuiltVerificationCliRun;
}

/**
 * Over an expectations-bound changeset run whose evidence judges every changed path, run the built
 * `reconcile` as the run's selectors with `--run`, again without `--run`, and again with a fresh
 * `--input`.
 */
export async function observeBuiltReconcileInvocations(): Promise<BuiltReconcileInvocationObservation> {
  return withBuiltBoundRun(BUILT_RUN_COVERAGE.EVERY_CHANGED_PATH, async (run) => {
    requireBoundRunEvidence(run);
    const inputFlag = flagOf(VERIFY_CLI.inputOption);
    const reconciled = await runBuiltVerificationRun(
      run.productDir,
      [VERIFY_CLI.reconcileCommandName],
      run.runSelectors,
    );
    const withoutRun = await runBuiltVerificationRun(run.productDir, [VERIFY_CLI.reconcileCommandName], run.selectors);
    const withInput = await runBuiltVerificationRun(
      run.productDir,
      [VERIFY_CLI.reconcileCommandName],
      [...run.runSelectors, inputFlag, VERIFY_INPUT_SOURCE.STDIN],
      JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload())),
    );
    return { reconciled, withoutRun, withInput };
  });
}
