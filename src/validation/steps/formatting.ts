/**
 * Formatting validation step.
 *
 * Spawns the `dprint` binary in check mode as a managed subprocess through an
 * injected process runner. dprint resolves its `dprint.jsonc` by upward
 * discovery from the working directory and applies the pinned formatter
 * plugins, so the stage obtains dprint's own multi-language verdict without
 * reimplementing any formatter. The binary resolves from the exact-pinned
 * runtime dependency shipped with the CLI.
 *
 * @module validation/steps/formatting
 */

import { createRequire } from "node:module";

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import {
  forwardValidationSubprocessOutput,
  VALIDATION_SUBPROCESS_EVENTS,
  type ValidationSubprocessOutputStreams,
} from "./subprocess-output";

export const DPRINT_EXECUTABLE_SPECIFIER = "dprint/bin.cjs";
/** Executable from the runtime dependency shipped with the published CLI. */
export const DPRINT_COMMAND = createRequire(import.meta.url).resolve(DPRINT_EXECUTABLE_SPECIFIER);
export const DPRINT_CHECK_SUBCOMMAND = "check";
export const DPRINT_EXCLUDES_OPTION = "--excludes";
export const DPRINT_OPTIONS_TERMINATOR = "--";

/** Product-root config filename; its presence gates whether the stage runs. */
export const DPRINT_CONFIG_FILENAME = "dprint.jsonc";

/** Default production runner: the shared lifecycle runner for signal/EPIPE cleanup. */
export const defaultFormattingProcessRunner: ProcessRunner = lifecycleProcessRunner;

/** Outcome of a dprint check run. */
export interface FormattingValidationResult {
  /** Whether dprint reported every file already formatted (exit 0). */
  readonly success: boolean;
  /** Captured dprint stdout and stderr, naming any unformatted files. */
  readonly output: string;
  /** Spawn-failure message when the subprocess could not run. */
  readonly error?: string;
}

/** Context for a single formatting check. */
export interface FormattingValidationContext {
  /** Working directory dprint runs in; also where it discovers `dprint.jsonc`. */
  readonly productDir: string;
  /** Explicit file scope; omitted to check the whole `dprint.jsonc` includes set. */
  readonly files?: readonly string[];
  /** Additive dprint excludes; omitted when validation path filters have none. */
  readonly excludes?: readonly string[];
}

/**
 * Build the `dprint check` argument vector.
 *
 * Pure function separate from the subprocess run so argument construction
 * verifies at `l1`. The check subcommand is always first; explicit file scope,
 * when present, follows in caller order.
 *
 * @param options - Optional explicit file scope
 * @returns dprint argument vector after the bare command
 *
 * @example
 * ```typescript
 * buildDprintCheckArgs({ files: ["src/index.ts"] });
 * // Returns: ["check", "src/index.ts"]
 * ```
 */
export function buildDprintCheckArgs(options: {
  files?: readonly string[];
  excludes?: readonly string[];
}): string[] {
  const excludes = options.excludes ?? [];
  const files = options.files ?? [];
  return [
    DPRINT_CHECK_SUBCOMMAND,
    ...(excludes.length > 0 ? [DPRINT_EXCLUDES_OPTION, ...excludes] : []),
    ...(files.length > 0 ? [DPRINT_OPTIONS_TERMINATOR] : []),
    ...files,
  ];
}

/**
 * Run dprint in check mode against the supplied project and optional file scope.
 *
 * @param context - Product directory and optional explicit file scope
 * @param runner - Injectable process runner (defaults to the lifecycle runner)
 * @returns Validation result with success, captured output, and spawn errors
 */
export async function validateFormatting(
  context: FormattingValidationContext,
  runner: ProcessRunner = defaultFormattingProcessRunner,
  outputStreams?: ValidationSubprocessOutputStreams,
): Promise<FormattingValidationResult> {
  const args = buildDprintCheckArgs({ files: context.files, excludes: context.excludes });

  return new Promise((resolve) => {
    const child = spawnManagedSubprocess(runner, DPRINT_COMMAND, args, { cwd: context.productDir });
    const chunks: string[] = [];
    const capture = (chunk: string | Uint8Array): void => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    };

    child.stdout?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, capture);
    child.stderr?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, capture);
    forwardValidationSubprocessOutput(child, outputStreams);

    child.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
      resolve({ success: code === 0, output: chunks.join("") });
    });

    child.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, (error) => {
      resolve({ success: false, output: chunks.join(""), error: error.message });
    });
  });
}
