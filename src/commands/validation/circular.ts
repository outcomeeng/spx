/**
 * Circular dependency check command.
 *
 * Runs dependency-cruiser to detect circular dependencies.
 */
import { resolveConfig } from "@/config/index";
import {
  authoredText,
  externalValue,
  joinTerminalText,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  type ValidationConfig,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { validationPathFilterForTool } from "@/validation/config/path-filter";
import { resolveTypeScriptValidationScope } from "@/validation/config/scope";
import { detectTypeScript } from "@/validation/discovery/index";
import { validateCircularDependencies } from "@/validation/steps/circular";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  formatTypeScriptAbsentSkipMessage,
  formatValidationConfigProblemMessage,
  formatValidationScopeNoTargetsSkipMessage,
  VALIDATION_COMMAND_OUTPUT,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "./messages";
import { type CircularCommandOptions, type ValidationCommandResult, validationReport } from "./types";

type CircularValidationResult = Awaited<ReturnType<typeof validateCircularDependencies>>;

const TYPESCRIPT_ABSENT_MESSAGE = formatTypeScriptAbsentSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR);
const CIRCULAR_CONFIG_ERROR_MESSAGE = formatValidationConfigProblemMessage(
  VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
  "configuration error",
);
export const CIRCULAR_DEPENDENCY_OUTPUT = {
  FOUND: VALIDATION_COMMAND_OUTPUT.CIRCULAR_FOUND,
} as const;

const CIRCULAR_CYCLE_ARROW = " → ";
const CIRCULAR_CYCLE_INDENT = "  ";

export interface CircularCommandDeps {
  readonly validateCircularDependencies: typeof validateCircularDependencies;
}

export const defaultCircularCommandDeps: CircularCommandDeps = {
  validateCircularDependencies,
};

function formatCircularValidationResult(result: CircularValidationResult, quiet: boolean): {
  readonly exitCode: number;
  readonly output: string;
  readonly terminalText: TerminalText;
} {
  if (result.success) {
    const output = quiet ? "" : VALIDATION_COMMAND_OUTPUT.CIRCULAR_NONE_FOUND;
    return { exitCode: 0, output, terminalText: authoredText(output) };
  }

  if (result.circularDependencies && result.circularDependencies.length > 0) {
    const cycles = result.circularDependencies
      .map((cycle) => `${CIRCULAR_CYCLE_INDENT}${cycle.join(CIRCULAR_CYCLE_ARROW)}`)
      .join("\n");
    // The heading, indent, and arrow are the product's own line structure; every module
    // identifier comes from the graph dependency-cruiser walked, so each is escaped here.
    const cycleLines = result.circularDependencies.map((cycle) =>
      terminal`${authoredText(CIRCULAR_CYCLE_INDENT)}${
        joinTerminalText(CIRCULAR_CYCLE_ARROW, cycle.map((module) => externalValue(module)))
      }`
    );
    return {
      exitCode: 1,
      output: `${CIRCULAR_DEPENDENCY_OUTPUT.FOUND}:\n${cycles}`,
      terminalText: validationReport([authoredText(`${CIRCULAR_DEPENDENCY_OUTPUT.FOUND}:`), ...cycleLines]),
    };
  }

  return {
    exitCode: 1,
    output: result.error ?? CIRCULAR_DEPENDENCY_OUTPUT.FOUND,
    terminalText: result.error === undefined
      ? authoredText(CIRCULAR_DEPENDENCY_OUTPUT.FOUND)
      : externalValue(result.error),
  };
}

/**
 * Check for circular dependencies.
 *
 * Gates dependency-cruiser execution on TypeScript language detection:
 * dependency-cruiser walks the TypeScript import graph and has nothing to
 * examine in non-TypeScript products.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function circularCommand(
  options: CircularCommandOptions,
  deps: CircularCommandDeps = defaultCircularCommandDeps,
): Promise<ValidationCommandResult> {
  const { cwd, files, quiet, scope = VALIDATION_SCOPES.FULL } = options;
  const startTime = Date.now();

  // Gate 1: language detection. No TypeScript = skip cleanly.
  const tsDetection = detectTypeScript(cwd);
  if (!tsDetection.present) {
    const output = quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE;
    return {
      exitCode: 0,
      output,
      terminalText: authoredText(output),
      durationMs: Date.now() - startTime,
    };
  }

  const loaded = await resolveConfig(cwd, [validationConfigDescriptor]);
  if (!loaded.ok) {
    return {
      exitCode: 1,
      output: `${CIRCULAR_CONFIG_ERROR_MESSAGE} — ${loaded.error}`,
      terminalText: terminal`${authoredText(CIRCULAR_CONFIG_ERROR_MESSAGE)} — ${externalValue(loaded.error)}`,
      durationMs: Date.now() - startTime,
    };
  }
  const validationConfig = loaded.value[validationConfigDescriptor.section] as ValidationConfig;
  const effectiveScopeConfig = resolveTypeScriptValidationScope({
    productDir: cwd,
    scope,
    paths: files,
    validationPathFilter: validationPathFilterForTool(
      validationConfig.paths,
      VALIDATION_PATH_TOOL_SUBSECTIONS.CIRCULAR,
    ),
  });
  const noTargetsMessage = formatValidationScopeNoTargetsSkipMessage(
    VALIDATION_STAGE_DISPLAY_NAMES.CIRCULAR,
    effectiveScopeConfig,
  );
  if (noTargetsMessage !== undefined) {
    const output = quiet ? "" : noTargetsMessage;
    return {
      exitCode: 0,
      output,
      terminalText: authoredText(output),
      durationMs: Date.now() - startTime,
    };
  }

  // Run circular dependency validation
  const result = await deps.validateCircularDependencies(scope, effectiveScopeConfig, cwd);
  const durationMs = Date.now() - startTime;
  return { ...formatCircularValidationResult(result, quiet === true), durationMs };
}
