import type { CliDeps, CliResult, ValidateOptions } from "./types";
import { CONFIG_FILENAME } from "./types";

const EXIT_CODE_INVALID = 1;

export async function validateCommand(_options: ValidateOptions, deps: CliDeps): Promise<CliResult> {
  const projectRoot = deps.resolveProjectRoot();
  const result = await deps.resolveConfig(projectRoot);

  if (!result.ok) {
    return {
      stdout: "",
      stderr: `${result.error}\n`,
      exitCode: EXIT_CODE_INVALID,
    };
  }

  return {
    stdout: `${CONFIG_FILENAME} at ${projectRoot} passes every registered descriptor's validator.\n`,
    stderr: "",
    exitCode: 0,
  };
}
