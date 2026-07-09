import type { CliCommandResult, Result } from "@/config/types";
import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";
import {
  JOURNAL_BACKEND,
  type JournalEdgeBackend,
  type JournalEnvironment,
  resolveJournalBackend,
} from "@/domains/journal/backend-selection";
import {
  JOURNAL_RUN_SEALED_FILTER,
  JOURNAL_RUN_TERMINAL_FILTER,
  type JournalRunDirectoryScope,
  journalRunFilePath,
  type JournalRunSealedFilter,
  type JournalRunTerminalFilter,
} from "@/domains/journal/run-scope";
import type { JournalEvent, JournalEventInput } from "@/lib/agent-run-journal";
import { artifactJournalRunArtifactName, hydratePriorRuns } from "@/lib/artifact-journal-store";
import { toMessage } from "@/lib/error-message";
import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  getCurrentBranch,
  getHeadSha,
  type GitDependencies,
} from "@/lib/git/root";
import type { GithubSnapshotClient } from "@/lib/github-snapshot-sink";
import {
  defaultStateStoreFileSystem,
  resolveBranchIdentity,
  slugBranchIdentity,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import { SPX_VERIFY_ENV, SPX_VERIFY_HEAD_SHA } from "@/lib/verification-env";

import { createGithubPrStreamSink } from "./github-pr-sink";
import {
  appendJournalEvent,
  findJournalRunBranchSlugs,
  type JournalListRunsScope,
  type JournalRunRef,
  type JournalStreamSink,
  listJournalRuns,
  openJournalRun,
  readJournalEvents,
  readSealedJournalRunSet,
  renderJournalRun,
  sealJournalRun,
} from "./runtime";

export const JOURNAL_CLI_EXIT_CODE = {
  OK: 0,
  ERROR: 1,
} as const;

export const JOURNAL_CLI_RUN_LIMIT = {
  DEFAULT: 20,
  MIN: 1,
} as const;

export const JOURNAL_CLI_READ_SET_EVENT_LIMIT = {
  DEFAULT: 100,
  MIN: 1,
} as const;

export const JOURNAL_CLI_ENV = {
  BACKEND: "SPX_VERIFY_BACKEND",
  BRANCH: SPX_VERIFY_ENV.BRANCH,
  CONTINUOUS_INTEGRATION: "CI",
  GITHUB_EVENT_NAME: "GITHUB_EVENT_NAME",
  GITHUB_REF: "GITHUB_REF",
  GITHUB_REPOSITORY: "GITHUB_REPOSITORY",
  // The directory the verification workflow's download-artifact step restores this pull
  // request's prior-run artifacts into, read by `open` to hydrate them under github-pr.
  RESTORED_RUNS_DIR: "SPX_JOURNAL_RESTORED_RUNS_DIR",
} as const;

export const JOURNAL_CLI_ERROR = {
  GITHUB_CLIENT_UNAVAILABLE: "github pull-request backend needs a GitHub client",
  GITHUB_REPOSITORY_MISSING: "github pull-request backend requires a non-empty GITHUB_REPOSITORY",
  PULL_REQUEST_UNRESOLVED: "github pull-request number is not resolvable from the environment",
  INVALID_EVENT_INPUT: "journal append event input is missing a required CloudEvents field",
  INVALID_CURSOR: "journal read cursor must be a whole non-negative integer",
  INVALID_RUN_LIMIT: "journal run limit must be a positive whole integer",
  INVALID_READ_SET_EVENT_LIMIT: "journal read-set event limit must be a positive whole integer",
  INVALID_SEALED_FILTER: "journal list sealed filter is not registered",
  INVALID_TERMINAL_STATE_FILTER: "journal list terminal-state filter is not registered",
  RUN_TOKEN_AMBIGUOUS: "journal run token matches multiple branch scopes; rerun with --branch-slug",
  OPEN_HYDRATION_FAILED: "journal open failed to hydrate the pull request's prior runs",
} as const;

const CURSOR_PATTERN = /^\d+$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const JOURNAL_EVENT_INPUT_STRING_FIELDS = ["id", "source", "type", "time"] as const;

export const JOURNAL_COMMENT_MARKER_PREFIX = "spx-journal-run:" as const;

/**
 * GitHub Actions event names that denote a pull-request CI context whose pull
 * request number is resolvable from `GITHUB_REF`. `pull_request_target` is
 * deliberately excluded: its `GITHUB_REF` is the base branch ref, so the PR
 * number lives only in the event payload — full support is tracked in this
 * node's ISSUES.md.
 */
export const GITHUB_PULL_REQUEST_EVENT_NAMES = {
  PULL_REQUEST: "pull_request",
} as const;

const GITHUB_PULL_REQUEST_EVENTS: ReadonlySet<string> = new Set(Object.values(GITHUB_PULL_REQUEST_EVENT_NAMES));
const PULL_REQUEST_REF_PATTERN = /^refs\/pull\/(\d+)\//u;
const DECIMAL_RADIX = 10;
/** The environment-variable values `isTruthyEnv` accepts as true (case-insensitive). */
export const TRUTHY_ENV_VALUES = ["1", "true"] as const;
const TRUTHY_ENV_VALUE_SET: ReadonlySet<string> = new Set(TRUTHY_ENV_VALUES);

export interface JournalCliDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly env?: JournalEnvironment;
  readonly branch?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
  readonly onWarning?: (warning: string | undefined) => void;
}

export interface JournalCliScope {
  readonly type: string;
  readonly branchSlug?: string;
}

export interface JournalRunCliScope extends JournalCliScope {
  readonly runToken: string;
}

export interface JournalReadSetCliScope extends JournalCliScope {
  readonly limit?: string;
  readonly eventLimit?: string;
}

export interface JournalListCliScope {
  readonly type?: string;
  readonly branchSlug?: string;
  readonly sealed?: string;
  readonly terminalState?: string;
  readonly limit?: string;
}

interface JournalRunContext {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly type: string;
  readonly backendKind: JournalEdgeBackend;
}

/** The boundary surfaces the descriptor binds for the journal streaming sink. */
export interface JournalStreamBinding {
  /** The local backend's streaming sink — standard output. */
  readonly localSink: JournalStreamSink;
  /** The GitHub client the github-pr backend upserts the pull-request comment through. */
  readonly githubClient?: GithubSnapshotClient;
  /** The `owner/repo` the github-pr client targets; empty when `GITHUB_REPOSITORY` is unset. */
  readonly githubRepository?: string;
}

function isTruthyEnv(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_ENV_VALUE_SET.has(value.toLowerCase());
}

/** Read the parts of the process environment that bind the journal backend at the edge. */
export function readJournalCliEnvironment(
  processEnv: NodeJS.ProcessEnv,
): { readonly backend: JournalEnvironment; readonly branch?: string } {
  const backendOverride = processEnv[JOURNAL_CLI_ENV.BACKEND];
  const branch = processEnv[JOURNAL_CLI_ENV.BRANCH];
  return {
    backend: {
      ...(backendOverride === undefined ? {} : { backendOverride }),
      continuousIntegration: isTruthyEnv(processEnv[JOURNAL_CLI_ENV.CONTINUOUS_INTEGRATION]),
      githubPullRequest: GITHUB_PULL_REQUEST_EVENTS.has(processEnv[JOURNAL_CLI_ENV.GITHUB_EVENT_NAME] ?? ""),
    },
    ...(branch === undefined ? {} : { branch }),
  };
}

async function resolveJournalRunContext(
  scope: JournalCliScope,
  deps: JournalCliDeps,
): Promise<Result<JournalRunContext>> {
  const cliEnvironment = readJournalCliEnvironment(deps.processEnv ?? process.env);
  const environment = deps.env ?? cliEnvironment.backend;

  const backend = resolveJournalBackend(environment);
  if (!backend.ok) return backend;

  const journalScope = await resolveJournalRunScope(scope, deps);
  if (!journalScope.ok) return journalScope;
  return {
    ok: true,
    value: {
      ...journalScope.value,
      backendKind: backend.value,
    },
  };
}

async function resolveJournalRunScope(
  scope: JournalCliScope,
  deps: JournalCliDeps,
): Promise<Result<JournalRunDirectoryScope>> {
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const git = deps.git ?? defaultGitDependencies;
  const cliEnvironment = readJournalCliEnvironment(deps.processEnv ?? process.env);
  const product = await detectGitCommonDirProductRoot(cwd, git);
  deps.onWarning?.(product.warning);
  let branchSlug = scope.branchSlug;
  if (branchSlug === undefined) {
    // Probe the branch and head only inside a git repository. Outside one (git
    // absent, which makes the probes throw, or simply not a repo), the root
    // resolver already fell back to cwd, so fall back to the caller/env branch and
    // the missing-head-sha placeholder rather than letting the probes fail the verb.
    const probedBranch = product.isGitRepo ? (await getCurrentBranch(cwd, git)) ?? undefined : undefined;
    const branchName = deps.branch ?? cliEnvironment.branch ?? probedBranch;
    const headSha = (product.isGitRepo ? await getHeadSha(cwd, git) : null) ?? SPX_VERIFY_HEAD_SHA.MISSING;
    const branchIdentity = resolveBranchIdentity({ ...(branchName === undefined ? {} : { branchName }), headSha });
    branchSlug = slugBranchIdentity(branchIdentity);
  }
  return {
    ok: true,
    value: {
      productDir: product.productDir,
      branchSlug,
      type: scope.type,
    },
  };
}

async function resolveJournalProductDir(deps: JournalCliDeps): Promise<string> {
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const git = deps.git ?? defaultGitDependencies;
  const product = await detectGitCommonDirProductRoot(cwd, git);
  deps.onWarning?.(product.warning);
  return product.productDir;
}

function resolvePullRequestNumber(processEnv: NodeJS.ProcessEnv): Result<number> {
  const match = processEnv[JOURNAL_CLI_ENV.GITHUB_REF]?.match(PULL_REQUEST_REF_PATTERN);
  const captured = match?.[1];
  if (captured === undefined) return { ok: false, error: JOURNAL_CLI_ERROR.PULL_REQUEST_UNRESOLVED };
  return { ok: true, value: Number.parseInt(captured, DECIMAL_RADIX) };
}

/** The upsertable pull-request comment marker that identifies one run's streamed projection. */
export function journalCommentMarker(type: string, runToken: string): string {
  return `${JOURNAL_COMMENT_MARKER_PREFIX}${type}:${runToken}`;
}

async function resolveAppendSink(
  ref: JournalRunRef,
  backendKind: JournalEdgeBackend,
  binding: JournalStreamBinding,
  deps: JournalCliDeps,
): Promise<Result<JournalStreamSink>> {
  if (backendKind === JOURNAL_BACKEND.LOCAL) return { ok: true, value: binding.localSink };
  if (binding.githubClient === undefined) return { ok: false, error: JOURNAL_CLI_ERROR.GITHUB_CLIENT_UNAVAILABLE };
  if (binding.githubRepository === undefined || binding.githubRepository.length === 0) {
    return { ok: false, error: JOURNAL_CLI_ERROR.GITHUB_REPOSITORY_MISSING };
  }
  const pullNumber = resolvePullRequestNumber(deps.processEnv ?? process.env);
  if (!pullNumber.ok) return pullNumber;
  return {
    ok: true,
    value: createGithubPrStreamSink({
      client: binding.githubClient,
      pullNumber: pullNumber.value,
      marker: journalCommentMarker(ref.type, ref.runToken),
      renderBody: async () => {
        const rendered = await renderJournalRun<readonly JournalEvent[]>(
          ref,
          (events) => [...events],
          verbOptions(deps),
        );
        // Throwing here prevents the sink's snapshot.write from running, so a
        // failed render never overwrites the pull-request comment with an empty
        // body; the throw is then caught by appendJournalEvent's best-effort
        // streaming try/catch, which returns success on the already-committed event.
        if (!rendered.ok) throw new Error(rendered.error);
        return JSON.stringify(rendered.value);
      },
    }),
  };
}

function openOptions(deps: JournalCliDeps) {
  return {
    ...(deps.fs === undefined ? {} : { fs: deps.fs }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.randomBytes === undefined ? {} : { randomBytes: deps.randomBytes }),
  };
}

function verbOptions(deps: JournalCliDeps) {
  return deps.fs === undefined ? {} : { fs: deps.fs };
}

function runRef(context: JournalRunContext, runToken: string): JournalRunRef {
  return { productDir: context.productDir, branchSlug: context.branchSlug, type: context.type, runToken };
}

async function inspectionRunRef(scope: JournalRunCliScope, deps: JournalCliDeps): Promise<Result<JournalRunRef>> {
  const context = await resolveJournalRunContext(scope, deps);
  if (!context.ok) return context;
  if (scope.branchSlug !== undefined) return { ok: true, value: runRef(context.value, scope.runToken) };
  const branches = await findJournalRunBranchSlugs(
    {
      productDir: context.value.productDir,
      type: context.value.type,
      runToken: scope.runToken,
    },
    verbOptions(deps),
  );
  if (!branches.ok) return branches;
  if (branches.value.length === 1) {
    const branchSlug = branches.value[0];
    return {
      ok: true,
      value: {
        productDir: context.value.productDir,
        branchSlug,
        type: context.value.type,
        runToken: scope.runToken,
      },
    };
  }
  if (branches.value.length > 1) return { ok: false, error: JOURNAL_CLI_ERROR.RUN_TOKEN_AMBIGUOUS };
  return { ok: true, value: runRef(context.value, scope.runToken) };
}

function okResult(output: string): CliCommandResult {
  return { exitCode: JOURNAL_CLI_EXIT_CODE.OK, output };
}

function errorResult(error: string): CliCommandResult {
  return { exitCode: JOURNAL_CLI_EXIT_CODE.ERROR, output: error };
}

/**
 * Hydrate the pull request's prior runs of this run's verification type before the run
 * opens, under the github-pr backend. The verification workflow's download step restores
 * those runs' artifacts into the staging directory named by `SPX_JOURNAL_RESTORED_RUNS_DIR`;
 * this reads them through the injected filesystem and materializes each into the runs
 * directory. An unset staging directory means the workflow restored no prior runs, so
 * hydration is a no-op. GitHub artifact transport is the workflow's, never this process's.
 */
async function hydrateGithubPriorRuns(
  context: JournalRunContext,
  pullNumber: number,
  deps: JournalCliDeps,
): Promise<Result<void>> {
  const restoredRunsDir = (deps.processEnv ?? process.env)[JOURNAL_CLI_ENV.RESTORED_RUNS_DIR];
  if (restoredRunsDir === undefined || restoredRunsDir.length === 0) return { ok: true, value: undefined };
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  try {
    await hydratePriorRuns({
      fs,
      restoredRunsDir,
      pullNumber,
      type: context.type,
      runFilePathFor: (runToken) => {
        const path = journalRunFilePath({
          productDir: context.productDir,
          branchSlug: context.branchSlug,
          type: context.type,
          runToken,
        });
        if (!path.ok) throw new Error(path.error);
        return path.value;
      },
    });
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `${JOURNAL_CLI_ERROR.OPEN_HYDRATION_FAILED}: ${toMessage(error)}` };
  }
}

/**
 * Open a new journal run and report its run token and run-file path. Under the github-pr
 * backend, this additionally hydrates the pull request's prior runs from the
 * workflow-restored staging directory and reports the run's per-run artifact name, which
 * the verification workflow's upload step retains the sealed run under.
 */
export async function journalOpenCommand(
  scope: JournalCliScope,
  deps: JournalCliDeps = {},
): Promise<CliCommandResult> {
  const context = await resolveJournalRunContext(scope, deps);
  if (!context.ok) return errorResult(context.error);

  // The pull request number addresses both the prior-run hydration and this run's artifact
  // name; resolve it once, only under github-pr. The github-pr backend was selected, so the
  // run must be durably addressable on the pull request — an unresolvable number is a
  // misconfigured environment, so reject at open rather than opening a run that can neither
  // hydrate prior runs nor be retained, pre-empting the same rejection every later append raises.
  let pullNumber: number | undefined;
  if (context.value.backendKind === JOURNAL_BACKEND.GITHUB_PR) {
    const resolved = resolvePullRequestNumber(deps.processEnv ?? process.env);
    if (!resolved.ok) return errorResult(resolved.error);
    pullNumber = resolved.value;
    const hydrated = await hydrateGithubPriorRuns(context.value, pullNumber, deps);
    if (!hydrated.ok) return errorResult(hydrated.error);
  }

  const opened = await openJournalRun(context.value, openOptions(deps));
  if (!opened.ok) return errorResult(opened.error);

  const artifactName = pullNumber === undefined
    ? undefined
    : artifactJournalRunArtifactName({ pullNumber, type: context.value.type, runToken: opened.value.ref.runToken });

  return okResult(
    JSON.stringify({
      runToken: opened.value.ref.runToken,
      runFile: opened.value.runFilePath,
      ...(artifactName === undefined ? {} : { artifactName }),
    }),
  );
}

/**
 * Validate that a parsed stdin value carries the required CloudEvents input
 * fields before it is appended, so a structurally incomplete event is rejected
 * at the boundary rather than persisted as a record the reader later skips.
 * Deep CloudEvents value rules (URI `source`, RFC3339 `time`) are a deferred
 * contract decision, not enforced here.
 */
export function validateJournalEventInput(value: unknown): Result<JournalEventInput> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: JOURNAL_CLI_ERROR.INVALID_EVENT_INPUT };
  }
  const record = value as Record<string, unknown>;
  for (const field of JOURNAL_EVENT_INPUT_STRING_FIELDS) {
    const candidate = record[field];
    if (typeof candidate !== "string" || candidate.length === 0) {
      return { ok: false, error: JOURNAL_CLI_ERROR.INVALID_EVENT_INPUT };
    }
  }
  if (typeof record.attempt !== "number" || !Number.isInteger(record.attempt)) {
    return { ok: false, error: JOURNAL_CLI_ERROR.INVALID_EVENT_INPUT };
  }
  return { ok: true, value: value as JournalEventInput };
}

/** Parse a `--from` cursor, rejecting a non-numeric or partially-numeric value before reading. */
export function parseJournalCursor(raw: string): Result<number> {
  if (!CURSOR_PATTERN.test(raw)) return { ok: false, error: JOURNAL_CLI_ERROR.INVALID_CURSOR };
  const value = Number.parseInt(raw, DECIMAL_RADIX);
  return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false, error: JOURNAL_CLI_ERROR.INVALID_CURSOR };
}

function parseJournalRunLimit(raw: string | undefined): Result<number> {
  if (raw === undefined) return { ok: true, value: JOURNAL_CLI_RUN_LIMIT.DEFAULT };
  if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
    return { ok: false, error: JOURNAL_CLI_ERROR.INVALID_RUN_LIMIT };
  }
  const value = Number.parseInt(raw, DECIMAL_RADIX);
  return Number.isSafeInteger(value) && value >= JOURNAL_CLI_RUN_LIMIT.MIN
    ? { ok: true, value }
    : { ok: false, error: JOURNAL_CLI_ERROR.INVALID_RUN_LIMIT };
}

function parseJournalReadSetEventLimit(raw: string | undefined): Result<number> {
  if (raw === undefined) return { ok: true, value: JOURNAL_CLI_READ_SET_EVENT_LIMIT.DEFAULT };
  if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
    return { ok: false, error: JOURNAL_CLI_ERROR.INVALID_READ_SET_EVENT_LIMIT };
  }
  const value = Number.parseInt(raw, DECIMAL_RADIX);
  return Number.isSafeInteger(value) && value >= JOURNAL_CLI_READ_SET_EVENT_LIMIT.MIN
    ? { ok: true, value }
    : { ok: false, error: JOURNAL_CLI_ERROR.INVALID_READ_SET_EVENT_LIMIT };
}

function parseJournalSealedFilter(raw: string | undefined): Result<JournalRunSealedFilter | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  const filter = Object.values(JOURNAL_RUN_SEALED_FILTER).find((candidate) => candidate === raw);
  return filter === undefined
    ? { ok: false, error: JOURNAL_CLI_ERROR.INVALID_SEALED_FILTER }
    : { ok: true, value: filter };
}

function parseJournalTerminalFilter(raw: string | undefined): Result<JournalRunTerminalFilter | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  const filter = Object.values(JOURNAL_RUN_TERMINAL_FILTER).find((candidate) => candidate === raw);
  return filter === undefined
    ? { ok: false, error: JOURNAL_CLI_ERROR.INVALID_TERMINAL_STATE_FILTER }
    : { ok: true, value: filter };
}

/**
 * Append a caller-supplied event to a run and stream it through the surface the
 * resolved backend binds — standard output under the local backend, the
 * pull-request comment under the github-pr backend.
 */
export async function journalAppendCommand(
  scope: JournalRunCliScope,
  input: unknown,
  binding: JournalStreamBinding,
  deps: JournalCliDeps = {},
): Promise<CliCommandResult> {
  const validatedInput = validateJournalEventInput(input);
  if (!validatedInput.ok) return errorResult(validatedInput.error);
  const context = await resolveJournalRunContext(scope, deps);
  if (!context.ok) return errorResult(context.error);
  const ref = runRef(context.value, scope.runToken);
  const sink = await resolveAppendSink(ref, context.value.backendKind, binding, deps);
  if (!sink.ok) return errorResult(sink.error);
  const appended = await appendJournalEvent(ref, validatedInput.value, sink.value, verbOptions(deps));
  if (!appended.ok) return errorResult(appended.error);
  // `append`'s output is the event delivered to the streaming surface (standard
  // output locally, the pull-request comment under github-pr), not a result line.
  // It returns an empty result so a successful append adds nothing beyond that
  // surface, unlike the one-shot verbs that each return a JSON result.
  return okResult("");
}

/** Read a run's events at or after the cursor, rejecting a malformed cursor before reading. */
export async function journalReadCommand(
  scope: JournalRunCliScope,
  fromCursor: string,
  deps: JournalCliDeps = {},
): Promise<CliCommandResult> {
  const cursor = parseJournalCursor(fromCursor);
  if (!cursor.ok) return errorResult(cursor.error);
  const ref = await inspectionRunRef(scope, deps);
  if (!ref.ok) return errorResult(ref.error);
  const events = await readJournalEvents(ref.value, cursor.value, verbOptions(deps));
  if (!events.ok) return errorResult(events.error);
  return okResult(JSON.stringify(events.value));
}

/** List persisted journal runs across optional branch, type, state, and recency filters. */
export async function journalListCommand(
  scope: JournalListCliScope,
  deps: JournalCliDeps = {},
): Promise<CliCommandResult> {
  const sealed = parseJournalSealedFilter(scope.sealed);
  if (!sealed.ok) return errorResult(sealed.error);
  const terminalState = parseJournalTerminalFilter(scope.terminalState);
  if (!terminalState.ok) return errorResult(terminalState.error);
  const limit = parseJournalRunLimit(scope.limit);
  if (!limit.ok) return errorResult(limit.error);

  const listScope: JournalListRunsScope = {
    productDir: await resolveJournalProductDir(deps),
    ...(scope.branchSlug === undefined ? {} : { branchSlug: scope.branchSlug }),
    ...(scope.type === undefined ? {} : { type: scope.type }),
    ...(sealed.value === undefined ? {} : { sealed: sealed.value }),
    ...(terminalState.value === undefined ? {} : { terminalState: terminalState.value }),
    limit: limit.value,
  };
  const runs = await listJournalRuns(listScope, verbOptions(deps));
  if (!runs.ok) return errorResult(runs.error);
  return okResult(JSON.stringify(runs.value));
}

/** Read every sealed journal in one branch/type scope in deterministic oldest-first order. */
export async function journalReadSetCommand(
  scope: JournalReadSetCliScope,
  deps: JournalCliDeps = {},
): Promise<CliCommandResult> {
  const limit = parseJournalRunLimit(scope.limit);
  if (!limit.ok) return errorResult(limit.error);
  const eventLimit = parseJournalReadSetEventLimit(scope.eventLimit);
  if (!eventLimit.ok) return errorResult(eventLimit.error);
  const context = await resolveJournalRunScope(scope, deps);
  if (!context.ok) return errorResult(context.error);
  const runs = await readSealedJournalRunSet(
    {
      ...context.value,
      eventLimit: eventLimit.value,
      limit: limit.value,
    },
    verbOptions(deps),
  );
  if (!runs.ok) return errorResult(runs.error);
  return okResult(JSON.stringify(runs.value));
}

/** Seal a run's journal so further appends are rejected. */
export async function journalSealCommand(
  scope: JournalRunCliScope,
  deps: JournalCliDeps = {},
): Promise<CliCommandResult> {
  const context = await resolveJournalRunContext(scope, deps);
  if (!context.ok) return errorResult(context.error);
  const sealed = await sealJournalRun(runRef(context.value, scope.runToken), verbOptions(deps));
  if (!sealed.ok) return errorResult(sealed.error);
  return okResult(JSON.stringify({ sealed: true }));
}

/** Render the event-prefix projection of a run. */
export async function journalRenderCommand(
  scope: JournalRunCliScope,
  deps: JournalCliDeps = {},
): Promise<CliCommandResult> {
  const ref = await inspectionRunRef(scope, deps);
  if (!ref.ok) return errorResult(ref.error);
  const rendered = await renderJournalRun<readonly JournalEvent[]>(
    ref.value,
    (events) => [...events],
    verbOptions(deps),
  );
  if (!rendered.ok) return errorResult(rendered.error);
  return okResult(JSON.stringify(rendered.value));
}
