import { dirname } from "node:path";

import { journalOpenCommand, readJournalCliEnvironment } from "@/commands/journal/cli";
import { verificationContextCreateCommand } from "@/commands/verification-context/cli";
import type { CliCommandResult, Result } from "@/config/types";
import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";
import { type JournalEdgeBackend, resolveJournalBackend } from "@/domains/journal/backend-selection";
import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import {
  buildRunLocator,
  type ChangesetScope,
  digestRunInput,
  type InputDescriptor,
  parseChangesetScope,
  type RecordedInput,
  type RunLocator,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_TYPE,
  verifyInputRecordPath,
  type VerifyRunScope,
  verifyRunsDir,
} from "@/domains/verify/verify";
import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  getCurrentBranch,
  getHeadSha,
  GIT_ROOT_COMMAND,
  type GitDependencies,
} from "@/git/root";
import { changesetNameStatusArgs, pathsFromNameStatus } from "@/lib/git/name-status";
import {
  defaultStateStoreFileSystem,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  resolveBranchIdentity,
  slugBranchIdentity,
  STATE_STORE_TEXT_ENCODING,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import { SPX_VERIFY_ENV, SPX_VERIFY_HEAD_SHA } from "@/lib/verification-env";

export const VERIFY_CLI_EXIT_CODE = {
  OK: 0,
  ERROR: 1,
} as const;

export const VERIFY_CLI_ENV = {
  BRANCH: SPX_VERIFY_ENV.BRANCH,
} as const;

export const VERIFY_CLI_ERROR = {
  INPUT_REQUIRED: "spx verify start requires --input <input-source>",
  RUN_REQUIRED: "spx verify existing-run verbs require an explicit --run <run-token>",
  RUN_NOT_FOUND: "spx verify could not locate the requested run",
  CHANGED_SCOPE_FAILED: "spx verify could not derive the changeset changed-file scope",
  INPUT_PERSIST_FAILED: "spx verify could not persist the recorded run input",
  INPUT_READ_FAILED: "spx verify could not read the recorded run input",
} as const;

export interface VerifyCliDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly branch?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
  readonly readInputSource: (source: string) => Promise<string>;
}

export interface VerifyStartCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly input: string;
}

export interface VerifyInputCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
}

export interface VerifyStartReport {
  readonly runToken: string;
  readonly contextDigest: string;
  readonly changedScope: readonly string[];
  readonly input: InputDescriptor;
  readonly locator: RunLocator;
}

export interface VerifyInputReport {
  readonly source: string;
  readonly digest: string;
  readonly content: string;
}

interface VerifyResolvedScope {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly backendIdentity: JournalEdgeBackend;
}

interface VerifyForwardedDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly branch?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
}

interface VerifyRunNotFoundContext {
  readonly runToken: string;
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scopeIdentity: string;
  readonly backendIdentity: string;
  readonly storageNamespace: string;
  readonly searchedTarget: string;
}

function okResult(output: string): CliCommandResult {
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, output };
}

function errorResult(error: string): CliCommandResult {
  return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: error };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : JSON.stringify(error);
}

/** Forward the shared resolution dependencies to the verification-context and journal substrate commands. */
function forwardDeps(deps: VerifyCliDeps): VerifyForwardedDeps {
  return {
    ...(deps.cwd === undefined ? {} : { cwd: deps.cwd }),
    ...(deps.git === undefined ? {} : { git: deps.git }),
    ...(deps.branch === undefined ? {} : { branch: deps.branch }),
    ...(deps.processEnv === undefined ? {} : { processEnv: deps.processEnv }),
    ...(deps.fs === undefined ? {} : { fs: deps.fs }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  };
}

/**
 * Resolve the run's product root, branch slug, and edge backend once from the shared
 * dependencies, so the journal run file, the input record, and the run locator all address
 * the same run identity.
 */
async function resolveVerifyScope(deps: VerifyCliDeps): Promise<Result<VerifyResolvedScope>> {
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const git = deps.git ?? defaultGitDependencies;
  const processEnv = deps.processEnv ?? process.env;
  const product = await detectGitCommonDirProductRoot(cwd, git);
  const probedBranch = product.isGitRepo ? (await getCurrentBranch(cwd, git)) ?? undefined : undefined;
  const headSha = (product.isGitRepo ? await getHeadSha(cwd, git) : null) ?? SPX_VERIFY_HEAD_SHA.MISSING;
  const branchName = deps.branch ?? processEnv[VERIFY_CLI_ENV.BRANCH] ?? probedBranch;
  const branchIdentity = resolveBranchIdentity({ ...(branchName === undefined ? {} : { branchName }), headSha });
  const backend = resolveJournalBackend(readJournalCliEnvironment(processEnv).backend);
  if (!backend.ok) return backend;
  return {
    ok: true,
    value: {
      productDir: product.productDir,
      branchSlug: slugBranchIdentity(branchIdentity),
      backendIdentity: backend.value,
    },
  };
}

/** Derive the changeset's changed product paths from a null-delimited name-status diff. */
async function resolveChangedScope(scope: ChangesetScope, deps: VerifyCliDeps): Promise<Result<readonly string[]>> {
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const git = deps.git ?? defaultGitDependencies;
  const diff = await git.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...changesetNameStatusArgs(scope.base, scope.head)], {
    cwd,
    reject: false,
  });
  if (diff.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED}: ${diff.stderr}` };
  }
  return { ok: true, value: pathsFromNameStatus(diff.stdout) };
}

async function persistInputRecord(
  runScope: VerifyRunScope,
  record: RecordedInput,
  deps: VerifyCliDeps,
): Promise<Result<void>> {
  const path = verifyInputRecordPath(runScope);
  if (!path.ok) return path;
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  try {
    await fs.mkdir(dirname(path.value), { recursive: true });
    await fs.writeFile(path.value, JSON.stringify(record));
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED}: ${toMessage(error)}` };
  }
}

async function readInputRecordAt(path: string, deps: VerifyCliDeps): Promise<Result<RecordedInput | undefined>> {
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  try {
    const content = await fs.readFile(path, STATE_STORE_TEXT_ENCODING);
    return { ok: true, value: JSON.parse(content) as RecordedInput };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_READ_FAILED}: ${toMessage(error)}` };
  }
}

function verifyRunNotFoundDiagnostic(context: VerifyRunNotFoundContext): string {
  return [
    VERIFY_CLI_ERROR.RUN_NOT_FOUND,
    `run=${context.runToken}`,
    `verification-type=${context.verificationType}`,
    `scope-type=${context.scopeType}`,
    `scope=${context.scopeIdentity}`,
    `backend=${context.backendIdentity}`,
    `namespace=${context.storageNamespace}`,
    `target=${context.searchedTarget}`,
  ].join(" ");
}

/**
 * Start a changeset-scoped verification run: create a canonical verification context, open a
 * run journal, record the verification input read from `--input`, derive the changed-file
 * scope, and report the run token, context digest, changed scope, input descriptor, and run
 * locator a caller persists to address the run.
 */
export async function verifyStartCommand(
  options: VerifyStartCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  if (options.scopeType !== VERIFY_SCOPE_TYPE.CHANGESET) return errorResult(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
  if (options.input.trim().length === 0) return errorResult(VERIFY_CLI_ERROR.INPUT_REQUIRED);
  const scope = parseChangesetScope(options.scope);
  if (!scope.ok) return errorResult(scope.error);
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return errorResult(resolved.error);

  const inputContent = await deps.readInputSource(options.input);
  const inputDigest = digestRunInput(options.input, inputContent);
  if (!inputDigest.ok) return errorResult(inputDigest.error);

  const context = await verificationContextCreateCommand(
    {
      subject: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
      base: scope.value.base,
      head: scope.value.head,
      predicate: options.verificationType,
      workflow: options.verificationType,
    },
    forwardDeps(deps),
  );
  if (context.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return errorResult(context.output);
  const contextDigest = (JSON.parse(context.output) as { readonly digest: string }).digest;

  const opened = await journalOpenCommand(
    { type: options.verificationType, branchSlug: resolved.value.branchSlug },
    forwardDeps(deps),
  );
  if (opened.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return errorResult(opened.output);
  const { runToken, runFile } = JSON.parse(opened.output) as { readonly runToken: string; readonly runFile: string };

  const runScope: VerifyRunScope = {
    productDir: resolved.value.productDir,
    branchSlug: resolved.value.branchSlug,
    type: options.verificationType,
    runToken,
  };
  const recorded: RecordedInput = { source: options.input, digest: inputDigest.value, content: inputContent };
  const persisted = await persistInputRecord(runScope, recorded, deps);
  if (!persisted.ok) return errorResult(persisted.error);

  const changedScope = await resolveChangedScope(scope.value, deps);
  if (!changedScope.ok) return errorResult(changedScope.error);

  const namespace = verifyRunsDir(runScope);
  if (!namespace.ok) return errorResult(namespace.error);

  const locator = buildRunLocator({
    runToken,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    scopeIdentity: options.scope,
    backendIdentity: resolved.value.backendIdentity,
    storageNamespace: namespace.value,
    runTarget: runFile,
  });
  const report: VerifyStartReport = {
    runToken,
    contextDigest,
    changedScope: changedScope.value,
    input: { source: options.input, digest: inputDigest.value },
    locator,
  };
  return okResult(JSON.stringify(report));
}

/**
 * Replay the verification input recorded at start for the run named by `--run`, reporting the
 * exact input content and the digest recorded at start rather than reading a fresh input. A
 * type/scope-only selection without a run token, or a run the store does not hold, is rejected.
 */
export async function verifyInputCommand(
  options: VerifyInputCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  if (options.run.trim().length === 0) return errorResult(VERIFY_CLI_ERROR.RUN_REQUIRED);
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return errorResult(resolved.error);

  const runScope: VerifyRunScope = {
    productDir: resolved.value.productDir,
    branchSlug: resolved.value.branchSlug,
    type: options.verificationType,
    runToken: options.run,
  };
  const path = verifyInputRecordPath(runScope);
  if (!path.ok) return errorResult(path.error);
  const namespace = verifyRunsDir(runScope);
  if (!namespace.ok) return errorResult(namespace.error);

  const record = await readInputRecordAt(path.value, deps);
  if (!record.ok) return errorResult(record.error);
  if (record.value === undefined) {
    return errorResult(
      verifyRunNotFoundDiagnostic({
        runToken: options.run,
        verificationType: options.verificationType,
        scopeType: options.scopeType,
        scopeIdentity: options.scope,
        backendIdentity: resolved.value.backendIdentity,
        storageNamespace: namespace.value,
        searchedTarget: path.value,
      }),
    );
  }
  const report: VerifyInputReport = {
    source: record.value.source,
    digest: record.value.digest,
    content: record.value.content,
  };
  return okResult(JSON.stringify(report));
}
