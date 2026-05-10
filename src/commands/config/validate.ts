import type { CliDeps, CliResult, ValidateOptions } from "./types";

const EXIT_CODE_INVALID = 1;

export const VALIDATE_SUCCESS_TOKENS = {
  PASSES_SUFFIX: "passes every registered descriptor's validator.",
  ABSENT_PREFIX: "No config file",
  ABSENT_SUBJECT: "descriptor defaults",
} as const;

function buildPresentSuccessLine(filename: string, projectRoot: string): string {
  return `${filename} at ${projectRoot} ${VALIDATE_SUCCESS_TOKENS.PASSES_SUFFIX}\n`;
}

function buildAbsentSuccessLine(projectRoot: string): string {
  return `${VALIDATE_SUCCESS_TOKENS.ABSENT_PREFIX} at ${projectRoot}; `
    + `${VALIDATE_SUCCESS_TOKENS.ABSENT_SUBJECT} ${VALIDATE_SUCCESS_TOKENS.PASSES_SUFFIX}\n`;
}

export async function validateCommand(_options: ValidateOptions, deps: CliDeps): Promise<CliResult> {
  const projectRoot = deps.resolveProjectRoot();

  const fileResult = await deps.readProjectConfigFile(projectRoot);
  if (!fileResult.ok) {
    return {
      stdout: "",
      stderr: `${fileResult.error}\n`,
      exitCode: EXIT_CODE_INVALID,
    };
  }

  const result = deps.resolveConfigFromReadResult(fileResult.value, deps.descriptors);
  if (!result.ok) {
    return {
      stdout: "",
      stderr: `${result.error}\n`,
      exitCode: EXIT_CODE_INVALID,
    };
  }

  const file = fileResult.value;
  const stdout = file.kind === "ok"
    ? buildPresentSuccessLine(file.file.filename, projectRoot)
    : buildAbsentSuccessLine(projectRoot);

  return { stdout, stderr: "", exitCode: 0 };
}
