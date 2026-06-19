import { basename } from "node:path";

import { resolveConfig } from "@/config/index";
import { digestDescriptorSection } from "@/config/descriptor-digest";
import type { Result } from "@/config/types";
import { PATH_FILTER_CONFIG_FIELDS, type PathFilterConfig } from "@/config/primitives/path-filter";
import { AUDIT_SECTION, auditConfigDescriptor, type AuditConfig } from "@/domains/audit/config";
import {
  AUDIT_RUN_EVENT,
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_DISPLAY,
  AUDIT_RUN_STATE_STATUS,
  type AuditIncompleteRun,
  type AuditRunProgressState,
  type AuditRunStartedState,
  type AuditRunState,
  type AuditTerminalRun,
  auditRunProgressEventInput,
  auditRunStartedEventInput,
  formatAuditRunTimestamp,
  isAuditProgressStep,
  resolveAuditBranchIdentity,
  selectLatestTerminalAuditRun,
  slugAuditBranchIdentity,
} from "@/domains/audit/run-state";
import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  getCurrentBranch,
  getHeadSha,
  type GitDependencies,
} from "@/git/root";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { escapeCliArgument, sanitizeCliArgument } from "@/lib/sanitize-cli-argument";

import {
  appendAuditRunEvent,
  createAuditRunFile,
  readAuditBranchRuns,
  readAuditRunEvents,
  removeAuditRunFile,
  resolveAuditRunFilePath,
  writeTerminalAuditRunState,
  type AuditRunFile,
  type AuditRunStateFileSystem,
} from "./run-state";

export const AUDIT_LIFECYCLE_EXIT_CODE = {
  OK: 0,
  ERROR: 1,
} as const;

export const AUDIT_COMMAND_RESULT_FORMAT = {
  JSON: "json",
  TEXT: "text",
} as const;

export { AUDIT_PROGRESS_STEP, type AuditProgressStep } from "@/domains/audit/run-state";

export interface AuditCommandResult {
  readonly exitCode: number;
  readonly output: string;
  readonly format: (typeof AUDIT_COMMAND_RESULT_FORMAT)[keyof typeof AUDIT_COMMAND_RESULT_FORMAT];
}

export interface AuditLifecycleDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly fs?: AuditRunStateFileSystem;
  readonly now?: () => Date;
}

export interface AuditInitOptions {
  readonly branch?: string;
  readonly headSha?: string;
  readonly json?: boolean;
}

export interface AuditProgressOptions {
  readonly runFile: string;
  readonly step: string;
  readonly message?: string;
  readonly json?: boolean;
}

export interface AuditCloseOptions {
  readonly runFile: string;
  readonly status: string;
  readonly verdictPath?: string;
  readonly json?: boolean;
}

export interface AuditStatusOptions {
  readonly branch?: string;
  readonly json?: boolean;
}

interface AuditStatusPayload {
  readonly branchName: string;
  readonly branchSlug: string;
  readonly latest: ReturnType<typeof selectLatestTerminalAuditRun>;
  readonly terminalRuns: readonly AuditTerminalRun[];
  readonly incompleteRuns: readonly AuditIncompleteRun[];
}

const AUDIT_STATUS_RENDER_LABEL = {
  LIST: "audit list",
  STATUS: "audit status",
} as const;
export const AUDIT_LIFECYCLE_TEXT_LABEL = {
  INCOMPLETE: "incomplete: ",
  RUN_FILE: "run file: ",
} as const;
const ROLLBACK_ERROR_SEPARATOR = "; rollback failed: ";
const AUDIT_TARGET_FILTER_DISPLAY = {
  EXCLUDE_PREFIX: "!",
  MATCH_ALL: "*",
} as const;
const AUDIT_CONFIG_DIGEST_ERROR_PREFIX = "failed to digest audit config";

export async function auditInitCommand(
  options: AuditInitOptions,
  deps: AuditLifecycleDeps = {},
): Promise<AuditCommandResult> {
  const cwd = deps.cwd ?? process.cwd();
  const git = deps.git ?? defaultGitDependencies;
  const product = await detectGitCommonDirProductRoot(cwd, git);
  const branchOverride = validateOptionalOverride(
    options.branch,
    AUDIT_RUN_STATE_ERROR.EMPTY_BRANCH_OVERRIDE,
  );
  if (!branchOverride.ok) return errorResult(branchOverride.error, options.json);
  const headShaOverride = validateOptionalOverride(
    options.headSha,
    AUDIT_RUN_STATE_ERROR.EMPTY_HEAD_SHA_OVERRIDE,
  );
  if (!headShaOverride.ok) return errorResult(headShaOverride.error, options.json);
  const currentBranch = branchOverride.value ?? (await getCurrentBranch(cwd, git)) ?? undefined;
  const headSha = headShaOverride.value ?? (await getHeadSha(cwd, git)) ?? "unknown";
  const branchIdentity = resolveAuditBranchIdentity({ branchName: currentBranch, headSha });
  const branchSlug = slugAuditBranchIdentity(branchIdentity);
  const auditConfig = await resolveAuditConfig(product.worktreeRoot);
  if (!auditConfig.ok) return errorResult(auditConfig.error, options.json);
  const digest = digestAuditConfig(auditConfig.value);
  if (!digest.ok) return errorResult(digest.error, options.json);
  const startedDate = (deps.now ?? (() => new Date()))();
  const runFile = await createAuditRunFile(product.productDir, branchSlug, {
    fs: deps.fs,
    now: () => startedDate,
  });
  if (!runFile.ok) return errorResult(runFile.error, options.json);

  const started: AuditRunStartedState = {
    branchName: branchIdentity,
    branchSlug,
    headSha,
    baseRef: auditConfig.value.baseRef,
    auditConfigDigest: digest.value,
    auditors: auditConfig.value.auditors,
    targets: auditConfig.value.targets,
    startedAt: runFile.value.startedAt,
  };
  const appended = await appendAuditRunEvent(
    product.productDir,
    runFile.value.runFilePath,
    auditRunStartedEventInput(started, {
      id: `${runFile.value.runFileName}:${AUDIT_RUN_EVENT.STARTED_TYPE}`,
      time: runFile.value.startedAt,
      attempt: 1,
    }),
    { fs: deps.fs },
  );
  if (!appended.ok) {
    const rollback = await removeAuditRunFile(product.productDir, runFile.value.runFilePath, { fs: deps.fs });
    if (!rollback.ok) {
      return errorResult(`${appended.error}${ROLLBACK_ERROR_SEPARATOR}${rollback.error}`, options.json);
    }
    return errorResult(appended.error, options.json);
  }

  const payload = { ...runFile.value, ...started };
  return okResult(payload, renderInit(payload), options.json);
}

export async function auditProgressCommand(
  options: AuditProgressOptions,
  deps: AuditLifecycleDeps = {},
): Promise<AuditCommandResult> {
  if (!isAuditProgressStep(options.step)) {
    return errorResult(AUDIT_RUN_STATE_ERROR.UNKNOWN_PROGRESS_STEP, options.json);
  }
  const runFile = await resolveCommandRunFile(options.runFile, deps);
  if (!runFile.ok) return errorResult(runFile.error, options.json);
  const events = await readAuditRunEvents(runFile.value.productDir, runFile.value.runFilePath, { fs: deps.fs });
  if (!events.ok) return errorResult(events.error, options.json);
  if (latestStartedState(events.value) === undefined) {
    return errorResult(AUDIT_RUN_STATE_ERROR.MISSING_INIT_EVENT, options.json);
  }
  const at = formatAuditRunTimestamp((deps.now ?? (() => new Date()))());
  const progress: AuditRunProgressState = {
    step: options.step,
    ...(options.message === undefined ? {} : { message: options.message }),
    at,
  };
  const appended = await appendAuditRunEvent(
    runFile.value.productDir,
    runFile.value.runFilePath,
    auditRunProgressEventInput(progress, {
      id: `${basename(runFile.value.runFilePath)}:${AUDIT_RUN_EVENT.PROGRESS_TYPE}:${at}`,
      time: at,
      attempt: 1,
    }),
    { fs: deps.fs },
  );
  if (!appended.ok) return errorResult(appended.error, options.json);

  return okResult({ runFile: runFile.value.runFilePath, ...progress }, renderProgress(progress), options.json);
}

export async function auditCloseCommand(
  options: AuditCloseOptions,
  deps: AuditLifecycleDeps = {},
): Promise<AuditCommandResult> {
  if (!isAuditCloseStatus(options.status)) {
    return errorResult(AUDIT_RUN_STATE_ERROR.UNKNOWN_CLOSE_STATUS, options.json);
  }
  const runFile = await resolveCommandRunFile(options.runFile, deps);
  if (!runFile.ok) return errorResult(runFile.error, options.json);
  const events = await readAuditRunEvents(runFile.value.productDir, runFile.value.runFilePath, { fs: deps.fs });
  if (!events.ok) return errorResult(events.error, options.json);
  const started = latestStartedState(events.value);
  if (started === undefined) {
    return errorResult(AUDIT_RUN_STATE_ERROR.MISSING_INIT_EVENT, options.json);
  }

  const completedAt = formatAuditRunTimestamp((deps.now ?? (() => new Date()))());
  const state: AuditRunState = {
    ...started,
    completedAt,
    ...(options.verdictPath === undefined ? {} : { verdictPath: options.verdictPath }),
    status: options.status,
  };
  const written = await writeTerminalAuditRunState(runFile.value.productDir, runFile.value.runFilePath, state, {
    fs: deps.fs,
  });
  if (!written.ok) return errorResult(written.error, options.json);

  return okResult({ runFile: runFile.value.runFilePath, state }, renderClose(state), options.json);
}

export async function auditStatusCommand(
  options: AuditStatusOptions,
  deps: AuditLifecycleDeps = {},
): Promise<AuditCommandResult> {
  const payload = await auditStatusPayload(options, deps);
  if (!payload.ok) return errorResult(payload.error, options.json);
  return okResult(payload.value, renderStatus(payload.value, AUDIT_STATUS_RENDER_LABEL.STATUS), options.json);
}

export async function auditListCommand(
  options: AuditStatusOptions,
  deps: AuditLifecycleDeps = {},
): Promise<AuditCommandResult> {
  const payload = await auditStatusPayload(options, deps);
  if (!payload.ok) return errorResult(payload.error, options.json);
  return okResult(payload.value, renderStatus(payload.value, AUDIT_STATUS_RENDER_LABEL.LIST), options.json);
}

async function auditStatusPayload(
  options: AuditStatusOptions,
  deps: AuditLifecycleDeps,
): Promise<Result<AuditStatusPayload>> {
  const cwd = deps.cwd ?? process.cwd();
  const git = deps.git ?? defaultGitDependencies;
  const product = await detectGitCommonDirProductRoot(cwd, git);
  const branchOverride = validateOptionalOverride(
    options.branch,
    AUDIT_RUN_STATE_ERROR.EMPTY_BRANCH_OVERRIDE,
  );
  if (!branchOverride.ok) return branchOverride;
  const currentBranch = branchOverride.value ?? (await getCurrentBranch(cwd, git)) ?? undefined;
  const headSha = (await getHeadSha(cwd, git)) ?? "unknown";
  const branchName = resolveAuditBranchIdentity({ branchName: currentBranch, headSha });
  const branchSlug = slugAuditBranchIdentity(branchName);
  const runs = await readAuditBranchRuns(product.productDir, branchSlug, { fs: deps.fs });
  if (!runs.ok) return runs;

  const latest = selectLatestTerminalAuditRun(runs.value.terminalRuns);
  return {
    ok: true,
    value: {
      branchName,
      branchSlug,
      latest,
      terminalRuns: runs.value.terminalRuns,
      incompleteRuns: runs.value.incompleteRuns,
    },
  };
}

async function resolveCommandRunFile(
  runFilePath: string,
  deps: AuditLifecycleDeps,
): Promise<Result<{ readonly productDir: string; readonly runFilePath: string }>> {
  const cwd = deps.cwd ?? process.cwd();
  const git = deps.git ?? defaultGitDependencies;
  const product = await detectGitCommonDirProductRoot(cwd, git);
  const resolved = resolveAuditRunFilePath(product.productDir, runFilePath, { cwd });
  return resolved.ok
    ? { ok: true, value: { productDir: product.productDir, runFilePath: resolved.value.runFilePath } }
    : resolved;
}

function latestStartedState(events: readonly JournalEvent[]): AuditRunStartedState | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== AUDIT_RUN_EVENT.STARTED_TYPE) continue;
    return isAuditRunStartedState(event.data) ? event.data : undefined;
  }
  return undefined;
}

function isAuditRunStartedState(value: unknown): value is AuditRunStartedState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.branchName === "string"
    && typeof record.branchSlug === "string"
    && typeof record.headSha === "string"
    && typeof record.baseRef === "string"
    && typeof record.auditConfigDigest === "string"
    && Array.isArray(record.auditors)
    && record.auditors.every((entry) => typeof entry === "string")
    && isAuditTargetFilter(record.targets)
    && typeof record.startedAt === "string";
}

function isAuditTargetFilter(value: unknown): value is PathFilterConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const include = record[PATH_FILTER_CONFIG_FIELDS.INCLUDE];
  const exclude = record[PATH_FILTER_CONFIG_FIELDS.EXCLUDE];
  return (include === undefined || (Array.isArray(include) && include.every((entry) => typeof entry === "string")))
    && (exclude === undefined || (Array.isArray(exclude) && exclude.every((entry) => typeof entry === "string")));
}

function validateOptionalOverride(
  value: string | undefined,
  error: string,
): Result<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  return value.trim().length > 0 ? { ok: true, value } : { ok: false, error };
}

async function resolveAuditConfig(productDir: string): Promise<Result<AuditConfig>> {
  const result = await resolveConfig(productDir, [auditConfigDescriptor]);
  if (!result.ok) return result;
  const section = result.value[AUDIT_SECTION];
  return auditConfigDescriptor.validate(section);
}

function digestAuditConfig(config: AuditConfig): Result<string> {
  const digest = digestDescriptorSection(config, AUDIT_SECTION);
  return digest.ok
    ? { ok: true, value: digest.value.sha256 }
    : { ok: false, error: `${AUDIT_CONFIG_DIGEST_ERROR_PREFIX}: ${digest.error}` };
}

function isAuditCloseStatus(value: string): value is AuditRunState["status"] {
  return Object.values(AUDIT_RUN_STATE_STATUS).includes(value as AuditRunState["status"]);
}

function okResult(payload: unknown, text: string, json: boolean | undefined): AuditCommandResult {
  return {
    exitCode: AUDIT_LIFECYCLE_EXIT_CODE.OK,
    output: json ? `${JSON.stringify(payload, null, 2)}\n` : `${text}\n`,
    format: json ? AUDIT_COMMAND_RESULT_FORMAT.JSON : AUDIT_COMMAND_RESULT_FORMAT.TEXT,
  };
}

function errorResult(error: string, json: boolean | undefined): AuditCommandResult {
  return {
    exitCode: AUDIT_LIFECYCLE_EXIT_CODE.ERROR,
    output: json ? `${JSON.stringify({ error }, null, 2)}\n` : `Error: ${sanitizeCliArgument(error)}\n`,
    format: json ? AUDIT_COMMAND_RESULT_FORMAT.JSON : AUDIT_COMMAND_RESULT_FORMAT.TEXT,
  };
}

function renderInit(payload: AuditRunFile & AuditRunStartedState): string {
  return [
    `audit init: ${sanitizeCliArgument(payload.runToken)}`,
    `branch: ${sanitizeCliArgument(payload.branchName)}`,
    `auditors: ${sanitizeCliList(payload.auditors)}`,
    `targets: ${sanitizeCliList(renderTargetFilter(payload.targets))}`,
    `${AUDIT_LIFECYCLE_TEXT_LABEL.RUN_FILE}${escapeCliArgument(payload.runFilePath)}`,
  ].join("\n");
}

function renderTargetFilter(targets: PathFilterConfig): readonly string[] {
  const include = targets.include === undefined || targets.include.length === 0
    ? [AUDIT_TARGET_FILTER_DISPLAY.MATCH_ALL]
    : targets.include;
  const exclude = (targets.exclude ?? []).map((target) => `${AUDIT_TARGET_FILTER_DISPLAY.EXCLUDE_PREFIX}${target}`);
  return [...include, ...exclude];
}

function renderProgress(progress: AuditRunProgressState): string {
  return `audit progress: ${sanitizeCliArgument(progress.step)}${
    progress.message === undefined ? "" : ` - ${sanitizeCliArgument(progress.message)}`
  }`;
}

function renderClose(state: AuditRunState): string {
  return `audit close: ${AUDIT_RUN_STATE_DISPLAY[state.status]}`;
}

function renderStatus(
  payload: AuditStatusPayload,
  label: (typeof AUDIT_STATUS_RENDER_LABEL)[keyof typeof AUDIT_STATUS_RENDER_LABEL],
): string {
  const latest = payload.latest === undefined
    ? "none"
    : AUDIT_RUN_STATE_DISPLAY[payload.latest.state.status];
  return [
    `${label}: ${latest}`,
    `branch: ${sanitizeCliArgument(payload.branchName)} (${sanitizeCliArgument(payload.branchSlug)})`,
    `terminal runs: ${payload.terminalRuns.length}`,
    `incomplete runs: ${payload.incompleteRuns.length}`,
    ...payload.incompleteRuns.map(renderIncompleteRun),
  ].join("\n");
}

function renderIncompleteRun(run: AuditIncompleteRun): string {
  return `${AUDIT_LIFECYCLE_TEXT_LABEL.INCOMPLETE}${sanitizeCliArgument(run.runFileName)} (${sanitizeCliArgument(run.reason)})${
    run.error === undefined ? "" : ` - ${sanitizeCliArgument(run.error)}`
  }`;
}

function sanitizeCliList(values: readonly string[]): string {
  return values.length === 0 ? "(none)" : values.map(sanitizeCliArgument).join(", ");
}
