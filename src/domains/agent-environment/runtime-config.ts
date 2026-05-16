import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

import type { Result } from "@/config/types";

import { AGENT_RUNTIME, type AgentEnvironmentConfig, type AgentRuntime } from "./config";

export const RUNTIME_CONFIG_TARGET_KIND = {
  INVOKING_AGENT: "invokingAgent",
  HERMETIC_EXECUTION: "hermeticExecution",
} as const;

export type RuntimeConfigTargetKind = (typeof RUNTIME_CONFIG_TARGET_KIND)[keyof typeof RUNTIME_CONFIG_TARGET_KIND];

export const RUNTIME_CONFIG_ACTION = {
  CREATE: "create",
  UPDATE: "update",
  UNCHANGED: "unchanged",
  SKIP_DISABLED: "skipDisabled",
} as const;

export type RuntimeConfigAction = (typeof RUNTIME_CONFIG_ACTION)[keyof typeof RUNTIME_CONFIG_ACTION];

export const RUNTIME_CONFIG_FORMAT = {
  JSON: "json",
  TOML: "toml",
} as const;

export type RuntimeConfigFormat = (typeof RUNTIME_CONFIG_FORMAT)[keyof typeof RUNTIME_CONFIG_FORMAT];

export const CODEX_RUNTIME_CONFIG_RELATIVE_PATH = ".codex/config.toml";
export const CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH = ".claude/settings.local.json";

export const HERMETIC_RUNTIME_CONFIG_DIRECTORY = "agent-environment/runtime-config";

export const RUNTIME_CONFIG_STATE_FIELDS = {
  SPX: "spx",
  AGENT_ENVIRONMENT: "agentEnvironment",
  ENABLED: "enabled",
  PRODUCT_DIR: "productDir",
  RUNTIME: "runtime",
  TARGET_KIND: "targetKind",
} as const;

export const RUNTIME_CONFIG_ERROR_MESSAGES = {
  INVALID_JSON: "not valid JSON runtime config",
  INVALID_TOML: "not valid TOML runtime config",
  ROLLBACK_FAILED: "rollback failed",
} as const;

export const RUNTIME_CONFIG_FILE_ERROR_CODES = {
  FILE_NOT_FOUND: "ENOENT",
} as const;

type RuntimeConfigField = (typeof RUNTIME_CONFIG_STATE_FIELDS)[keyof typeof RUNTIME_CONFIG_STATE_FIELDS];

export type RuntimeConfigTarget =
  | { readonly kind: typeof RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT }
  | {
    readonly kind: typeof RUNTIME_CONFIG_TARGET_KIND.HERMETIC_EXECUTION;
    /** Owning hermetic execution domains pass a validated local state directory. */
    readonly stateDir: string;
  };

export interface RuntimeConfigReconciliationOptions {
  readonly productDir: string;
  readonly agentEnvironment: AgentEnvironmentConfig;
  readonly target?: RuntimeConfigTarget;
  readonly dryRun?: boolean;
  readonly deps?: RuntimeConfigDependencies;
}

export interface RuntimeConfigFilePlan {
  readonly runtime: AgentRuntime;
  readonly action: RuntimeConfigAction;
  readonly format: RuntimeConfigFormat;
  readonly path: string;
  readonly content?: string;
}

export interface RuntimeConfigReconciliation {
  readonly productDir: string;
  readonly target: RuntimeConfigTarget;
  readonly dryRun: boolean;
  readonly changed: boolean;
  readonly files: readonly RuntimeConfigFilePlan[];
}

export interface RuntimeConfigFileSystem {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  mkdir(path: string, options: { readonly recursive: true }): Promise<unknown>;
  rm(path: string, options: { readonly force: true }): Promise<unknown>;
  writeFile(path: string, content: string, encoding: BufferEncoding): Promise<unknown>;
}

export interface RuntimeConfigDependencies {
  readonly fs: RuntimeConfigFileSystem;
}

type RuntimeConfigState = {
  readonly [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: boolean;
  readonly [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: string;
  readonly [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: AgentRuntime;
  readonly [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: RuntimeConfigTargetKind;
};

type InternalRuntimeConfigFilePlan = RuntimeConfigFilePlan & {
  readonly previousContent?: string;
};

type InternalRuntimeConfigReconciliation = Omit<RuntimeConfigReconciliation, "files"> & {
  readonly files: readonly InternalRuntimeConfigFilePlan[];
};

const DEFAULT_RUNTIME_CONFIG_TARGET: RuntimeConfigTarget = {
  kind: RUNTIME_CONFIG_TARGET_KIND.INVOKING_AGENT,
};

const RUNTIME_CONFIG_SPECS = {
  [AGENT_RUNTIME.CODEX]: {
    runtime: AGENT_RUNTIME.CODEX,
    format: RUNTIME_CONFIG_FORMAT.TOML,
    relativePath: CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
  },
  [AGENT_RUNTIME.CLAUDE_CODE]: {
    runtime: AGENT_RUNTIME.CLAUDE_CODE,
    format: RUNTIME_CONFIG_FORMAT.JSON,
    relativePath: CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH,
  },
} as const;

const RUNTIME_CONFIG_ORDER = [
  AGENT_RUNTIME.CODEX,
  AGENT_RUNTIME.CLAUDE_CODE,
] as const;

const CODEX_RUNTIME_CONFIG_DIRECTORY = "codex";
const CLAUDE_CODE_RUNTIME_CONFIG_DIRECTORY = "claude-code";
const JSON_INDENT = 2;
export const RUNTIME_CONFIG_TEXT_ENCODING = "utf-8";
const TOML_MANAGED_TABLE_HEADER =
  `[${RUNTIME_CONFIG_STATE_FIELDS.SPX}.${RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT}]`;
const TOML_MANAGED_INLINE_ASSIGNMENT_PATTERN = new RegExp(
  `^${RUNTIME_CONFIG_STATE_FIELDS.SPX}\\s*\\.\\s*${RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT}\\s*=`,
);

const DEFAULT_RUNTIME_CONFIG_DEPENDENCIES: RuntimeConfigDependencies = {
  fs: {
    readFile,
    mkdir,
    rm,
    writeFile,
  },
};

export async function planRuntimeConfigReconciliation(
  options: RuntimeConfigReconciliationOptions,
): Promise<Result<RuntimeConfigReconciliation>> {
  const deps = options.deps ?? DEFAULT_RUNTIME_CONFIG_DEPENDENCIES;
  const plan = await planRuntimeConfigReconciliationWithDeps(options, deps);
  if (!plan.ok) return plan;
  return { ok: true, value: publicRuntimeConfigReconciliation(plan.value) };
}

async function planRuntimeConfigReconciliationWithDeps(
  options: RuntimeConfigReconciliationOptions,
  deps: RuntimeConfigDependencies,
): Promise<Result<InternalRuntimeConfigReconciliation>> {
  const target = options.target ?? DEFAULT_RUNTIME_CONFIG_TARGET;
  const files: InternalRuntimeConfigFilePlan[] = [];

  for (const runtime of RUNTIME_CONFIG_ORDER) {
    const runtimeConfig = options.agentEnvironment.runtimes[runtime];
    const spec = RUNTIME_CONFIG_SPECS[runtime];
    const path = runtimeConfigPath(options.productDir, runtime, target);

    if (!runtimeConfig.enabled) {
      files.push({
        runtime,
        action: RUNTIME_CONFIG_ACTION.SKIP_DISABLED,
        format: spec.format,
        path,
      });
      continue;
    }

    const reconciled = await reconcileRuntimeConfigFile({
      productDir: options.productDir,
      runtime,
      target,
      format: spec.format,
      path,
      deps,
    });
    if (!reconciled.ok) return reconciled;

    files.push(reconciled.value);
  }

  return {
    ok: true,
    value: {
      productDir: options.productDir,
      target,
      dryRun: options.dryRun === true,
      changed: files.some((file) =>
        file.action === RUNTIME_CONFIG_ACTION.CREATE || file.action === RUNTIME_CONFIG_ACTION.UPDATE
      ),
      files,
    },
  };
}

export async function reconcileRuntimeConfig(
  options: RuntimeConfigReconciliationOptions,
): Promise<Result<RuntimeConfigReconciliation>> {
  const deps = options.deps ?? DEFAULT_RUNTIME_CONFIG_DEPENDENCIES;
  const plan = await planRuntimeConfigReconciliationWithDeps(options, deps);
  if (!plan.ok) return plan;

  if (!plan.value.dryRun) {
    const attempted: RuntimeConfigFilePlan[] = [];
    for (const file of plan.value.files) {
      if (file.content === undefined) continue;
      attempted.push(file);
      const written = await writeRuntimeConfigFile(file.path, file.content, deps);
      if (!written.ok) {
        const rolledBack = await rollbackRuntimeConfigFiles(attempted, deps);
        if (!rolledBack.ok) {
          return {
            ok: false,
            error: `${written.error}; ${RUNTIME_CONFIG_ERROR_MESSAGES.ROLLBACK_FAILED}: ${rolledBack.error}`,
          };
        }
        return written;
      }
    }
  }

  return { ok: true, value: publicRuntimeConfigReconciliation(plan.value) };
}

export function runtimeConfigPath(
  productDir: string,
  runtime: AgentRuntime,
  target: RuntimeConfigTarget = DEFAULT_RUNTIME_CONFIG_TARGET,
): string {
  const spec = RUNTIME_CONFIG_SPECS[runtime];
  if (target.kind === RUNTIME_CONFIG_TARGET_KIND.HERMETIC_EXECUTION) {
    return join(target.stateDir, HERMETIC_RUNTIME_CONFIG_DIRECTORY, runtimeDirectory(runtime), spec.relativePath);
  }
  return join(productDir, spec.relativePath);
}

async function reconcileRuntimeConfigFile(options: {
  readonly productDir: string;
  readonly runtime: AgentRuntime;
  readonly target: RuntimeConfigTarget;
  readonly format: RuntimeConfigFormat;
  readonly path: string;
  readonly deps: RuntimeConfigDependencies;
}): Promise<Result<InternalRuntimeConfigFilePlan>> {
  const current = await readOptionalRuntimeConfigFile(options.path, options.deps);
  if (!current.ok) return current;

  const state = runtimeConfigState(options.productDir, options.runtime, options.target.kind);
  const content = mergeRuntimeConfigContent(current.value, options.format, state, options.path);
  if (!content.ok) return content;

  if (current.value === content.value) {
    return {
      ok: true,
      value: {
        runtime: options.runtime,
        action: RUNTIME_CONFIG_ACTION.UNCHANGED,
        format: options.format,
        path: options.path,
      },
    };
  }

  return {
    ok: true,
    value: {
      runtime: options.runtime,
      action: current.value === undefined ? RUNTIME_CONFIG_ACTION.CREATE : RUNTIME_CONFIG_ACTION.UPDATE,
      format: options.format,
      path: options.path,
      previousContent: current.value,
      content: content.value,
    },
  };
}

async function readOptionalRuntimeConfigFile(
  path: string,
  deps: RuntimeConfigDependencies,
): Promise<Result<string | undefined>> {
  try {
    return { ok: true, value: await deps.fs.readFile(path, RUNTIME_CONFIG_TEXT_ENCODING) };
  } catch (error) {
    if (isFileNotFound(error)) return { ok: true, value: undefined };
    return { ok: false, error: `failed to read runtime config ${path}: ${toMessage(error)}` };
  }
}

function mergeRuntimeConfigContent(
  current: string | undefined,
  format: RuntimeConfigFormat,
  state: RuntimeConfigState,
  path: string,
): Result<string> {
  switch (format) {
    case RUNTIME_CONFIG_FORMAT.JSON:
      return mergeJsonRuntimeConfig(current, state, path);
    case RUNTIME_CONFIG_FORMAT.TOML:
      return mergeTomlRuntimeConfig(current, state, path);
  }
}

function mergeJsonRuntimeConfig(
  current: string | undefined,
  state: RuntimeConfigState,
  path: string,
): Result<string> {
  const parsed = current === undefined || current.trim() === ""
    ? ({ ok: true as const, value: {} })
    : parseJsonRuntimeConfig(current, path);
  if (!parsed.ok) return parsed;
  const next = {
    ...parsed.value,
    [RUNTIME_CONFIG_STATE_FIELDS.SPX]: {
      ...readNestedRecord(parsed.value, RUNTIME_CONFIG_STATE_FIELDS.SPX),
      [RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT]: state,
    },
  };

  return { ok: true, value: `${JSON.stringify(next, null, JSON_INDENT)}\n` };
}

function mergeTomlRuntimeConfig(
  current: string | undefined,
  state: RuntimeConfigState,
  path: string,
): Result<string> {
  const parsed = current === undefined || current.trim() === ""
    ? ({ ok: true as const, value: {} })
    : parseTomlRuntimeConfig(current, path);
  if (!parsed.ok) return parsed;
  return { ok: true, value: mergeTomlManagedTable(current, renderTomlManagedTable(state)) };
}

function parseJsonRuntimeConfig(raw: string, path: string): Result<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return { ok: false, error: `${path} is ${RUNTIME_CONFIG_ERROR_MESSAGES.INVALID_JSON}: ${toMessage(error)}` };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: `${path} must contain a JSON object` };
  }
  return { ok: true, value: parsed };
}

function parseTomlRuntimeConfig(raw: string, path: string): Result<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = parseToml(raw) as unknown;
  } catch (error) {
    return { ok: false, error: `${path} is ${RUNTIME_CONFIG_ERROR_MESSAGES.INVALID_TOML}: ${toMessage(error)}` };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: `${path} must contain a TOML object` };
  }
  return { ok: true, value: parsed };
}

function runtimeConfigState(
  productDir: string,
  runtime: AgentRuntime,
  targetKind: RuntimeConfigTargetKind,
): RuntimeConfigState {
  return {
    [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
    [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
    [RUNTIME_CONFIG_STATE_FIELDS.RUNTIME]: runtime,
    [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: targetKind,
  };
}

function runtimeDirectory(runtime: AgentRuntime): string {
  switch (runtime) {
    case AGENT_RUNTIME.CODEX:
      return CODEX_RUNTIME_CONFIG_DIRECTORY;
    case AGENT_RUNTIME.CLAUDE_CODE:
      return CLAUDE_CODE_RUNTIME_CONFIG_DIRECTORY;
  }
}

function readNestedRecord(
  value: Record<string, unknown>,
  field: RuntimeConfigField,
): Record<string, unknown> {
  const nested = value[field];
  return isRecord(nested) ? nested : {};
}

async function writeRuntimeConfigFile(
  path: string,
  content: string,
  deps: RuntimeConfigDependencies,
): Promise<Result<undefined>> {
  try {
    await deps.fs.mkdir(dirname(path), { recursive: true });
    await deps.fs.writeFile(path, content, RUNTIME_CONFIG_TEXT_ENCODING);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `failed to write runtime config ${path}: ${toMessage(error)}` };
  }
}

async function rollbackRuntimeConfigFiles(
  files: readonly InternalRuntimeConfigFilePlan[],
  deps: RuntimeConfigDependencies,
): Promise<Result<undefined>> {
  const errors: string[] = [];
  for (const file of [...files].reverse()) {
    const rolledBack = await rollbackRuntimeConfigFile(file, deps);
    if (!rolledBack.ok) errors.push(rolledBack.error);
  }
  if (errors.length > 0) return { ok: false, error: errors.join("; ") };
  return { ok: true, value: undefined };
}

async function rollbackRuntimeConfigFile(
  file: InternalRuntimeConfigFilePlan,
  deps: RuntimeConfigDependencies,
): Promise<Result<undefined>> {
  if (file.previousContent === undefined) {
    return removeRuntimeConfigFile(file.path, deps);
  }
  return writeRuntimeConfigFile(file.path, file.previousContent, deps);
}

async function removeRuntimeConfigFile(
  path: string,
  deps: RuntimeConfigDependencies,
): Promise<Result<undefined>> {
  try {
    await deps.fs.rm(path, { force: true });
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `failed to remove runtime config ${path}: ${toMessage(error)}` };
  }
}

function renderTomlManagedTable(state: RuntimeConfigState): string {
  return stringifyToml({
    [RUNTIME_CONFIG_STATE_FIELDS.SPX]: {
      [RUNTIME_CONFIG_STATE_FIELDS.AGENT_ENVIRONMENT]: state,
    },
  });
}

function mergeTomlManagedTable(current: string | undefined, managedTable: string): string {
  const normalizedManagedTable = ensureTrailingNewline(managedTable);
  if (current === undefined || current.trim() === "") return normalizedManagedTable;

  const currentLines = trimTrailingNewline(current.replace(/\r\n/g, "\n")).split("\n");
  const managedLines = trimTrailingNewline(normalizedManagedTable).split("\n");
  const managedStart = currentLines.findIndex(isTomlManagedTableHeader);
  if (managedStart === -1) {
    const inlineManagedStart = currentLines.findIndex(isTomlManagedInlineAssignment);
    if (inlineManagedStart !== -1) {
      const currentWithoutInlineAssignment = [
        ...currentLines.slice(0, inlineManagedStart),
        ...currentLines.slice(inlineManagedStart + 1),
      ].join("\n");
      return `${trimTrailingNewline(currentWithoutInlineAssignment)}\n\n${normalizedManagedTable}`;
    }
    return `${trimTrailingNewline(current)}\n\n${normalizedManagedTable}`;
  }

  const managedEnd = findNextTomlTableHeader(currentLines, managedStart + 1);
  return `${
    [
      ...currentLines.slice(0, managedStart),
      ...managedLines,
      ...currentLines.slice(managedEnd),
    ].join("\n")
  }\n`;
}

function findNextTomlTableHeader(lines: readonly string[], start: number): number {
  const offset = lines.slice(start).findIndex(isTomlTableHeader);
  return offset === -1 ? lines.length : start + offset;
}

function isTomlManagedTableHeader(line: string): boolean {
  return line.trim() === TOML_MANAGED_TABLE_HEADER;
}

function isTomlManagedInlineAssignment(line: string): boolean {
  return TOML_MANAGED_INLINE_ASSIGNMENT_PATTERN.test(line.trimStart());
}

function isTomlTableHeader(line: string): boolean {
  return line.trimStart().startsWith("[");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function trimTrailingNewline(value: string): string {
  return value.replace(/\n+$/, "");
}

function publicRuntimeConfigReconciliation(
  reconciliation: InternalRuntimeConfigReconciliation,
): RuntimeConfigReconciliation {
  return {
    ...reconciliation,
    files: reconciliation.files.map(publicRuntimeConfigFilePlan),
  };
}

function publicRuntimeConfigFilePlan(file: InternalRuntimeConfigFilePlan): RuntimeConfigFilePlan {
  const { previousContent: _previousContent, ...publicFile } = file;
  return publicFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFileNotFound(error: unknown): boolean {
  return isNodeError(error) && error.code === RUNTIME_CONFIG_FILE_ERROR_CODES.FILE_NOT_FOUND;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
