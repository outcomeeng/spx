import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parse as parseToml, stringify as stringifyToml } from "smol-toml";

import type { Result } from "@/config/types";
import { toMessage } from "@/lib/error-message";

import { AGENT, type Agent, type HarnessEnvironmentConfig } from "./config";

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

export const HERMETIC_RUNTIME_CONFIG_DIRECTORY = "harness-environment/runtime-config";

export const RUNTIME_CONFIG_STATE_FIELDS = {
  SPX: "spx",
  HARNESS_ENVIRONMENT: "harnessEnvironment",
  ENABLED: "enabled",
  PRODUCT_DIR: "productDir",
  AGENT: "agent",
  TARGET_KIND: "targetKind",
} as const;

export const RUNTIME_CONFIG_ERROR_MESSAGES = {
  INVALID_JSON: "not valid JSON configured-agent config",
  INVALID_TOML: "not valid TOML configured-agent config",
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
  readonly harnessEnvironment: HarnessEnvironmentConfig;
  readonly target?: RuntimeConfigTarget;
  readonly dryRun?: boolean;
  readonly deps?: RuntimeConfigDependencies;
}

export interface RuntimeConfigFilePlan {
  readonly agent: Agent;
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
  readonly [RUNTIME_CONFIG_STATE_FIELDS.AGENT]: Agent;
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
  [AGENT.CODEX]: {
    agent: AGENT.CODEX,
    format: RUNTIME_CONFIG_FORMAT.TOML,
    relativePath: CODEX_RUNTIME_CONFIG_RELATIVE_PATH,
  },
  [AGENT.CLAUDE_CODE]: {
    agent: AGENT.CLAUDE_CODE,
    format: RUNTIME_CONFIG_FORMAT.JSON,
    relativePath: CLAUDE_CODE_RUNTIME_CONFIG_RELATIVE_PATH,
  },
} as const;

const RUNTIME_CONFIG_ORDER = [
  AGENT.CODEX,
  AGENT.CLAUDE_CODE,
] as const;

const CODEX_AGENT_CONFIG_DIRECTORY = "codex";
const CLAUDE_CODE_AGENT_CONFIG_DIRECTORY = "claude-code";
const JSON_INDENT = 2;
export const RUNTIME_CONFIG_TEXT_ENCODING = "utf-8";
const TOML_MULTILINE_BASIC_STRING_DELIMITER = "\"\"\"";
const TOML_MULTILINE_LITERAL_STRING_DELIMITER = "'''";
const TOML_MANAGED_TABLE_HEADER =
  `[${RUNTIME_CONFIG_STATE_FIELDS.SPX}.${RUNTIME_CONFIG_STATE_FIELDS.HARNESS_ENVIRONMENT}]`;
const TOML_MANAGED_INLINE_ASSIGNMENT_PATTERN = new RegExp(
  String.raw`^${RUNTIME_CONFIG_STATE_FIELDS.SPX}\s*\.\s*${RUNTIME_CONFIG_STATE_FIELDS.HARNESS_ENVIRONMENT}\s*=`,
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
  const plan = await planRuntimeConfigReconciliationWithDeps({ ...options, dryRun: true }, deps);
  if (!plan.ok) return plan;
  return { ok: true, value: publicRuntimeConfigReconciliation(plan.value) };
}

async function planRuntimeConfigReconciliationWithDeps(
  options: RuntimeConfigReconciliationOptions,
  deps: RuntimeConfigDependencies,
): Promise<Result<InternalRuntimeConfigReconciliation>> {
  const target = options.target ?? DEFAULT_RUNTIME_CONFIG_TARGET;
  const files: InternalRuntimeConfigFilePlan[] = [];

  for (const agent of RUNTIME_CONFIG_ORDER) {
    const agentConfig = options.harnessEnvironment.agents[agent];
    const spec = RUNTIME_CONFIG_SPECS[agent];
    const path = runtimeConfigPath(options.productDir, agent, target);

    if (!agentConfig.enabled) {
      files.push({
        agent,
        action: RUNTIME_CONFIG_ACTION.SKIP_DISABLED,
        format: spec.format,
        path,
      });
      continue;
    }

    const reconciled = await reconcileRuntimeConfigFile({
      productDir: options.productDir,
      agent,
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
      // A failed write can still leave partial bytes, so rollback includes the file being written.
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
  agent: Agent,
  target: RuntimeConfigTarget = DEFAULT_RUNTIME_CONFIG_TARGET,
): string {
  const spec = RUNTIME_CONFIG_SPECS[agent];
  if (target.kind === RUNTIME_CONFIG_TARGET_KIND.HERMETIC_EXECUTION) {
    return join(target.stateDir, HERMETIC_RUNTIME_CONFIG_DIRECTORY, agentConfigDirectory(agent), spec.relativePath);
  }
  return join(productDir, spec.relativePath);
}

async function reconcileRuntimeConfigFile(options: {
  readonly productDir: string;
  readonly agent: Agent;
  readonly target: RuntimeConfigTarget;
  readonly format: RuntimeConfigFormat;
  readonly path: string;
  readonly deps: RuntimeConfigDependencies;
}): Promise<Result<InternalRuntimeConfigFilePlan>> {
  const current = await readOptionalRuntimeConfigFile(options.path, options.deps);
  if (!current.ok) return current;

  const state = runtimeConfigState(options.productDir, options.agent, options.target.kind);
  const content = mergeRuntimeConfigContent(current.value, options.format, state, options.path);
  if (!content.ok) return content;

  if (current.value === content.value) {
    return {
      ok: true,
      value: {
        agent: options.agent,
        action: RUNTIME_CONFIG_ACTION.UNCHANGED,
        format: options.format,
        path: options.path,
      },
    };
  }

  return {
    ok: true,
    value: {
      agent: options.agent,
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
    return { ok: false, error: `failed to read configured-agent config ${path}: ${toMessage(error)}` };
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
      [RUNTIME_CONFIG_STATE_FIELDS.HARNESS_ENVIRONMENT]: state,
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
    parsed = parseToml(raw);
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
  agent: Agent,
  targetKind: RuntimeConfigTargetKind,
): RuntimeConfigState {
  return {
    [RUNTIME_CONFIG_STATE_FIELDS.ENABLED]: true,
    [RUNTIME_CONFIG_STATE_FIELDS.PRODUCT_DIR]: productDir,
    [RUNTIME_CONFIG_STATE_FIELDS.AGENT]: agent,
    [RUNTIME_CONFIG_STATE_FIELDS.TARGET_KIND]: targetKind,
  };
}

function agentConfigDirectory(agent: Agent): string {
  switch (agent) {
    case AGENT.CODEX:
      return CODEX_AGENT_CONFIG_DIRECTORY;
    case AGENT.CLAUDE_CODE:
      return CLAUDE_CODE_AGENT_CONFIG_DIRECTORY;
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
    return { ok: false, error: `failed to write configured-agent config ${path}: ${toMessage(error)}` };
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
    return { ok: false, error: `failed to remove configured-agent config ${path}: ${toMessage(error)}` };
  }
}

function renderTomlManagedTable(state: RuntimeConfigState): string {
  return stringifyToml({
    [RUNTIME_CONFIG_STATE_FIELDS.SPX]: {
      [RUNTIME_CONFIG_STATE_FIELDS.HARNESS_ENVIRONMENT]: state,
    },
  });
}

function mergeTomlManagedTable(current: string | undefined, managedTable: string): string {
  const normalizedManagedTable = ensureTrailingNewline(managedTable);
  if (current === undefined || current.trim() === "") return normalizedManagedTable;

  const currentLines = trimTrailingNewline(current.replaceAll("\r\n", "\n")).split("\n");
  const managedLines = trimTrailingNewline(normalizedManagedTable).split("\n");
  const managedStart = findTopLevelTomlLine(currentLines, 0, isTomlManagedTableHeader);
  if (managedStart === -1) {
    const inlineManagedStart = findTopLevelTomlLine(currentLines, 0, isTomlManagedInlineAssignment);
    if (inlineManagedStart !== -1) {
      const currentWithoutInlineAssignment = [
        ...currentLines.slice(0, inlineManagedStart),
        ...currentLines.slice(inlineManagedStart + 1),
      ].join("\n");
      return `${trimTrailingNewline(currentWithoutInlineAssignment)}\n\n${normalizedManagedTable}`;
    }
    return `${trimTrailingNewline(current)}\n\n${normalizedManagedTable}`;
  }

  const managedEnd = findNextTopLevelTomlTableHeader(currentLines, managedStart + 1);
  const separatorLines = trailingBlankLines(currentLines, managedStart + 1, managedEnd);
  return `${
    [
      ...currentLines.slice(0, managedStart),
      ...managedLines,
      ...separatorLines,
      ...currentLines.slice(managedEnd),
    ].join("\n")
  }\n`;
}

function findNextTopLevelTomlTableHeader(lines: readonly string[], start: number): number {
  const index = findTopLevelTomlLine(lines, start, isTomlTableHeader);
  return index === -1 ? lines.length : index;
}

function findTopLevelTomlLine(
  lines: readonly string[],
  start: number,
  predicate: (line: string) => boolean,
): number {
  let multilineDelimiter: string | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (index >= start && multilineDelimiter === undefined && predicate(line)) return index;
    multilineDelimiter = scanTomlMultilineStringDelimiter(line, multilineDelimiter);
  }
  return -1;
}

function scanTomlMultilineStringDelimiter(
  line: string,
  activeDelimiter: string | undefined,
): string | undefined {
  let delimiter = activeDelimiter;
  let offset = 0;
  while (offset < line.length) {
    if (delimiter === undefined) {
      const comment = findTomlCommentStart(line, offset);
      const next = nextTomlMultilineStringStart(line, offset, comment);
      if (next === undefined) return undefined;
      delimiter = next.delimiter;
      offset = next.index + delimiter.length;
      continue;
    }

    const closing = findTomlDelimiter(line, delimiter, offset);
    if (closing === -1) return delimiter;
    offset = closing + delimiter.length;
    delimiter = undefined;
  }
  return delimiter;
}

function findTomlCommentStart(line: string, offset: number): number {
  let inBasicString = false;
  let inLiteralString = false;
  for (let index = offset; index < line.length; index += 1) {
    const character = line[index];
    if (character === "#" && !inBasicString && !inLiteralString) return index;
    if (character === "\"" && !inLiteralString && !isEscapedTomlDelimiter(line, index)) {
      inBasicString = !inBasicString;
    }
    if (character === "'" && !inBasicString) {
      inLiteralString = !inLiteralString;
    }
  }
  return line.length;
}

function nextTomlMultilineStringStart(
  line: string,
  offset: number,
  limit: number = line.length,
): { readonly delimiter: string; readonly index: number } | undefined {
  const basicIndex = findTomlDelimiter(line, TOML_MULTILINE_BASIC_STRING_DELIMITER, offset, limit);
  const literalIndex = findTomlDelimiter(line, TOML_MULTILINE_LITERAL_STRING_DELIMITER, offset, limit);
  if (basicIndex === -1 && literalIndex === -1) return undefined;
  if (basicIndex !== -1 && (literalIndex === -1 || basicIndex < literalIndex)) {
    return { delimiter: TOML_MULTILINE_BASIC_STRING_DELIMITER, index: basicIndex };
  }
  return { delimiter: TOML_MULTILINE_LITERAL_STRING_DELIMITER, index: literalIndex };
}

function findTomlDelimiter(line: string, delimiter: string, offset: number, limit: number = line.length): number {
  let index = line.indexOf(delimiter, offset);
  while (index !== -1) {
    if (index >= limit) return -1;
    if (delimiter !== TOML_MULTILINE_BASIC_STRING_DELIMITER || !isEscapedTomlDelimiter(line, index)) return index;
    index = line.indexOf(delimiter, index + delimiter.length);
  }
  return -1;
}

function isEscapedTomlDelimiter(line: string, index: number): boolean {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

function trailingBlankLines(lines: readonly string[], start: number, end: number): readonly string[] {
  let separatorStart = end;
  while (separatorStart > start && lines[separatorStart - 1]?.trim() === "") {
    separatorStart -= 1;
  }
  return lines.slice(separatorStart, end);
}

function isTomlManagedTableHeader(line: string): boolean {
  return line.trim() === TOML_MANAGED_TABLE_HEADER;
}

function isTomlManagedInlineAssignment(line: string): boolean {
  return TOML_MANAGED_INLINE_ASSIGNMENT_PATTERN.test(line.trimStart());
}

function isTomlTableHeader(line: string): boolean {
  const trimmed = line.trim();
  const commentStart = trimmed.indexOf("#");
  const header = commentStart === -1 ? trimmed : trimmed.slice(0, commentStart).trimEnd();
  if (header.startsWith("[[") && header.endsWith("]]")) {
    const inner = header.slice(2, -2);
    return inner.length > 0 && !inner.includes("]");
  }
  if (header.startsWith("[") && header.endsWith("]")) {
    const inner = header.slice(1, -1);
    return inner.length > 0 && !inner.includes("]");
  }
  return false;
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function trimTrailingNewline(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "\n") {
    end -= 1;
  }
  return value.slice(0, end);
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
