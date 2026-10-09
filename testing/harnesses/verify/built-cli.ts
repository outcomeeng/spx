/**
 * Built-executable harness for the `spx verification run` command paths: runs `node bin/spx.js`
 * against a real Git repository in a temporary directory, so l2 evidence exercises the packaged
 * Commander wiring, standard-input reading, and process exit codes rather than in-process handlers.
 *
 * @module testing/harnesses/verify/built-cli
 */

import { access, mkdir, readdir, readFile, realpath } from "node:fs/promises";
import { join, relative } from "node:path";

import { execa } from "execa";

import { JOURNAL_CLI_ENV } from "@/commands/journal/cli";
import { VERIFY_CLI_EXIT_CODE, type VerifyStartReport, type VerifyStatusReport } from "@/commands/verify/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import {
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
import { initializeVerifyRepository } from "@testing/harnesses/verify/repository";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

/** The bundle `bin/spx.js` loads; absent until `pnpm run build` produces it. */
const BUILT_CLI_BUNDLE = join(PRODUCT_ROOT, "dist", "cli.js");
const BUILT_CLI_MISSING_EXIT_CODE = 1;
const HEADLESS_RUN_TEMP_PREFIX = "verify-built-headless-run-";
const HEADLESS_RUN_PRODUCT_DIRECTORY = "product";

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

function flagOf(optionExpression: string): string {
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
