/**
 * Circular dependency check command.
 *
 * Runs madge to detect circular dependencies.
 */
import { getTypeScriptScope } from "@/validation/config/scope";
import { detectTypeScript, discoverTool, formatSkipMessage } from "@/validation/discovery/index";
import { validateCircularDependencies } from "@/validation/steps/circular";
import type { CircularCommandOptions, ValidationCommandResult } from "./types";

const TYPESCRIPT_ABSENT_MESSAGE = "⏭ Skipping Circular dependencies (TypeScript not detected in project)";
export const CIRCULAR_DEPENDENCY_OUTPUT = {
  FOUND: "Circular dependencies found",
} as const;

/**
 * Check for circular dependencies.
 *
 * Gates madge execution on TypeScript language detection: madge walks the
 * TypeScript import graph and has nothing to examine in non-TypeScript
 * projects.
 *
 * @param options - Command options
 * @returns Command result with exit code and output
 */
export async function circularCommand(options: CircularCommandOptions): Promise<ValidationCommandResult> {
  const { cwd, quiet } = options;
  const startTime = Date.now();

  // Gate 1: language detection. No TypeScript = skip cleanly.
  const tsDetection = detectTypeScript(cwd);
  if (!tsDetection.present) {
    return {
      exitCode: 0,
      output: quiet ? "" : TYPESCRIPT_ABSENT_MESSAGE,
      durationMs: Date.now() - startTime,
    };
  }

  // Gate 2: tool discovery.
  const toolResult = await discoverTool("madge", { projectRoot: cwd });
  if (!toolResult.found) {
    const skipMessage = formatSkipMessage("circular dependency check", toolResult);
    return { exitCode: 0, output: skipMessage, durationMs: Date.now() - startTime };
  }

  // Get scope configuration from tsconfig (circular always uses full scope)
  const scopeConfig = getTypeScriptScope("full");

  // Run circular dependency validation
  const result = await validateCircularDependencies("full", scopeConfig);
  const durationMs = Date.now() - startTime;

  // Map result to command output
  if (result.success) {
    const output = quiet ? "" : `Circular dependencies: ✓ None found`;
    return { exitCode: 0, output, durationMs };
  } else {
    // Format circular dependency output
    let output = result.error ?? CIRCULAR_DEPENDENCY_OUTPUT.FOUND;
    if (result.circularDependencies && result.circularDependencies.length > 0) {
      const cycles = result.circularDependencies
        .map((cycle) => `  ${cycle.join(" → ")}`)
        .join("\n");
      output = `${CIRCULAR_DEPENDENCY_OUTPUT.FOUND}:\n${cycles}`;
    }
    return { exitCode: 1, output, durationMs };
  }
}
