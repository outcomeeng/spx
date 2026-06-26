/**
 * Formatting validation step.
 *
 * Spawns the `dprint` binary in check mode as a managed subprocess through an
 * injected process runner. dprint resolves its `dprint.jsonc` by upward
 * discovery from the working directory and applies the pinned formatter
 * plugins, so the stage obtains dprint's own multi-language verdict without
 * reimplementing any formatter. The binary is the bare `dprint` command
 * resolved from `PATH` — a required tool like `git` or `python3`.
 *
 * @module validation/steps/formatting
 */

import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { VALIDATION_SUBPROCESS_EVENTS } from "./subprocess-output";

/** Bare command resolved from `PATH`; check mode reports without rewriting. */
export const DPRINT_COMMAND = "dprint";
export const DPRINT_CHECK_SUBCOMMAND = "check";
export const DPRINT_EXCLUDES_OPTION = "--excludes";

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
  readonly projectRoot: string;
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
  return [
    DPRINT_CHECK_SUBCOMMAND,
    ...(excludes.length > 0 ? [DPRINT_EXCLUDES_OPTION, ...excludes] : []),
    ...(options.files ?? []),
  ];
}

/**
 * Run dprint in check mode against the supplied project and optional file scope.
 *
 * @param context - Project root and optional explicit file scope
 * @param runner - Injectable process runner (defaults to the lifecycle runner)
 * @returns Validation result with success, captured output, and spawn errors
 */
export async function validateFormatting(
  context: FormattingValidationContext,
  runner: ProcessRunner = defaultFormattingProcessRunner,
): Promise<FormattingValidationResult> {
  const args = buildDprintCheckArgs({ files: context.files, excludes: context.excludes });

  return new Promise((resolve) => {
    const child = spawnManagedSubprocess(runner, DPRINT_COMMAND, args, { cwd: context.projectRoot });
    const chunks: string[] = [];
    const capture = (chunk: string | Uint8Array): void => {
      chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    };

    child.stdout?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, capture);
    child.stderr?.on(VALIDATION_SUBPROCESS_EVENTS.DATA, capture);

    child.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
      resolve({ success: code === 0, output: chunks.join("") });
    });

    child.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, (error) => {
      resolve({ success: false, output: chunks.join(""), error: error.message });
    });
  });
}
