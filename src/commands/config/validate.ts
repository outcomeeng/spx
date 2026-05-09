import { DEFAULT_CONFIG_FILENAME, formatConfigFileAmbiguityError } from "@/config/index";

import type { CliDeps, CliResult, ValidateOptions } from "./types";

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

  const fileResult = await deps.readProjectConfigFile(projectRoot);
  if (!fileResult.ok) {
    return {
      stdout: "",
      stderr: `${fileResult.error}\n`,
      exitCode: EXIT_CODE_INVALID,
    };
  }

  const file = fileResult.value;
  if (file.kind === "ambiguous") {
    return {
      stdout: "",
      stderr: `${formatConfigFileAmbiguityError(file.detected)}\n`,
      exitCode: EXIT_CODE_INVALID,
    };
  }

  const validatedFilename = file.kind === "ok" ? file.file.filename : DEFAULT_CONFIG_FILENAME;

  return {
    stdout: `${validatedFilename} at ${projectRoot} passes every registered descriptor's validator.\n`,
    stderr: "",
    exitCode: 0,
  };
}
