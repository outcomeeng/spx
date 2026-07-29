import { CONFIG_FILE_READ_KIND } from "@/config";

import type { CliDeps, CliResult, ValidateOptions } from "./types";

const EXIT_CODE_INVALID = 1;

export const VALIDATE_SUCCESS_TOKENS = {
  PASSES_SUFFIX: "passes every registered descriptor's validator.",
  ABSENT_PREFIX: "No config file",
  ABSENT_SUBJECT: "descriptor defaults",
} as const;

function buildPresentSuccessLine(filename: string, productDir: string): string {
  return `${filename} at ${productDir} ${VALIDATE_SUCCESS_TOKENS.PASSES_SUFFIX}\n`;
}

function buildAbsentSuccessLine(productDir: string): string {
  return `${VALIDATE_SUCCESS_TOKENS.ABSENT_PREFIX} at ${productDir}; `
    + `${VALIDATE_SUCCESS_TOKENS.ABSENT_SUBJECT} ${VALIDATE_SUCCESS_TOKENS.PASSES_SUFFIX}\n`;
}

export async function validateCommand(_options: ValidateOptions, deps: CliDeps): Promise<CliResult> {
  const productDir = deps.resolveProductDir();

  const fileResult = await deps.readProductConfigFile(productDir);
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
  const stdout = file.kind === CONFIG_FILE_READ_KIND.OK
    ? buildPresentSuccessLine(file.file.filename, productDir)
    : buildAbsentSuccessLine(productDir);

  return { stdout, stderr: "", exitCode: 0 };
}
