import type { Result } from "@/config/types";
import { JOURNAL_BACKEND, type JournalEnvironment, resolveJournalBackend } from "@/domains/journal/backend-selection";
import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  getCurrentBranch,
  getHeadSha,
  type GitDependencies,
} from "@/git/root";
import type { JournalEvent, JournalEventInput } from "@/lib/agent-run-journal";
import { resolveBranchIdentity, slugBranchIdentity, type StateStoreFileSystem } from "@/lib/state-store";

import {
  appendJournalEvent,
  type JournalRunRef,
  type JournalStreamSink,
  openJournalRun,
  readJournalEvents,
  renderJournalRun,
  sealJournalRun,
} from "./runtime";

export const JOURNAL_CLI_EXIT_CODE = {
  OK: 0,
  ERROR: 1,
} as const;

export const JOURNAL_CLI_ENV = {
  BACKEND: "SPX_VERIFY_BACKEND",
  BRANCH: "SPX_VERIFY_BRANCH",
  CONTINUOUS_INTEGRATION: "CI",
  GITHUB_EVENT_NAME: "GITHUB_EVENT_NAME",
} as const;

export const JOURNAL_CLI_ERROR = {
  BACKEND_UNAVAILABLE: "journal backend not available on this surface",
  HEAD_SHA_UNAVAILABLE: "unknown",
} as const;

const GITHUB_PULL_REQUEST_EVENT = "pull_request";
const TRUTHY_ENV_VALUES: readonly string[] = ["1", "true"];

export interface JournalCliResult {
  readonly exitCode: number;
  readonly output: string;
}

export interface JournalCliDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly env?: JournalEnvironment;
  readonly branch?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
}

export interface JournalCliScope {
  readonly type: string;
  readonly branch?: string;
}

export interface JournalRunCliScope extends JournalCliScope {
  readonly runToken: string;
}

interface JournalRunContext {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly type: string;
}

function isTruthyEnv(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_ENV_VALUES.includes(value.toLowerCase());
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
      githubPullRequest: processEnv[JOURNAL_CLI_ENV.GITHUB_EVENT_NAME] === GITHUB_PULL_REQUEST_EVENT,
    },
    ...(branch === undefined ? {} : { branch }),
  };
}

async function resolveJournalRunContext(
  scope: JournalCliScope,
  deps: JournalCliDeps,
): Promise<Result<JournalRunContext>> {
  const cwd = deps.cwd ?? process.cwd();
  const git = deps.git ?? defaultGitDependencies;
  const cliEnvironment = readJournalCliEnvironment(deps.processEnv ?? process.env);
  const environment = deps.env ?? cliEnvironment.backend;

  const backend = resolveJournalBackend(environment);
  if (!backend.ok) return backend;
  if (backend.value !== JOURNAL_BACKEND.LOCAL) {
    return { ok: false, error: `${JOURNAL_CLI_ERROR.BACKEND_UNAVAILABLE}: ${backend.value}` };
  }

  const product = await detectGitCommonDirProductRoot(cwd, git);
  const branchName = scope.branch ?? deps.branch ?? cliEnvironment.branch ?? (await getCurrentBranch(cwd, git))
    ?? undefined;
  const headSha = (await getHeadSha(cwd, git)) ?? JOURNAL_CLI_ERROR.HEAD_SHA_UNAVAILABLE;
  const branchIdentity = resolveBranchIdentity({ ...(branchName === undefined ? {} : { branchName }), headSha });
  return {
    ok: true,
    value: { productDir: product.productDir, branchSlug: slugBranchIdentity(branchIdentity), type: scope.type },
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

function okResult(output: string): JournalCliResult {
  return { exitCode: JOURNAL_CLI_EXIT_CODE.OK, output };
}

function errorResult(error: string): JournalCliResult {
  return { exitCode: JOURNAL_CLI_EXIT_CODE.ERROR, output: error };
}

/** Open a new journal run and report its run token and run-file path. */
export async function journalOpenCommand(scope: JournalCliScope, deps: JournalCliDeps = {}): Promise<JournalCliResult> {
  const context = await resolveJournalRunContext(scope, deps);
  if (!context.ok) return errorResult(context.error);
  const opened = await openJournalRun(context.value, openOptions(deps));
  if (!opened.ok) return errorResult(opened.error);
  return okResult(JSON.stringify({ runToken: opened.value.ref.runToken, runFile: opened.value.runFilePath }));
}

/** Append a caller-supplied event to a run and stream it through the sink. */
export async function journalAppendCommand(
  scope: JournalRunCliScope,
  input: JournalEventInput,
  sink: JournalStreamSink,
  deps: JournalCliDeps = {},
): Promise<JournalCliResult> {
  const context = await resolveJournalRunContext(scope, deps);
  if (!context.ok) return errorResult(context.error);
  const appended = await appendJournalEvent(runRef(context.value, scope.runToken), input, sink, verbOptions(deps));
  if (!appended.ok) return errorResult(appended.error);
  return okResult(JSON.stringify({ seq: appended.value.seq }));
}

/** Read a run's events at or after the cursor. */
export async function journalReadCommand(
  scope: JournalRunCliScope,
  fromCursor: number,
  deps: JournalCliDeps = {},
): Promise<JournalCliResult> {
  const context = await resolveJournalRunContext(scope, deps);
  if (!context.ok) return errorResult(context.error);
  const events = await readJournalEvents(runRef(context.value, scope.runToken), fromCursor, verbOptions(deps));
  if (!events.ok) return errorResult(events.error);
  return okResult(JSON.stringify(events.value));
}

/** Seal a run's journal so further appends are rejected. */
export async function journalSealCommand(
  scope: JournalRunCliScope,
  deps: JournalCliDeps = {},
): Promise<JournalCliResult> {
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
): Promise<JournalCliResult> {
  const context = await resolveJournalRunContext(scope, deps);
  if (!context.ok) return errorResult(context.error);
  const rendered = await renderJournalRun<readonly JournalEvent[]>(
    runRef(context.value, scope.runToken),
    (events) => [...events],
    verbOptions(deps),
  );
  if (!rendered.ok) return errorResult(rendered.error);
  return okResult(JSON.stringify(rendered.value));
}
