import { PRECOMMIT_DEFAULTS, type PrecommitConfig } from "./config";

export const VITEST_ARGS = {
  RUN: "--run",
  RELATED: "related",
} as const;

export function isTestFile(filePath: string, config: PrecommitConfig = PRECOMMIT_DEFAULTS): boolean {
  return filePath.includes(config.testPattern);
}

export function buildVitestArgs(files: string[], config: PrecommitConfig = PRECOMMIT_DEFAULTS): string[] {
  if (files.length === 0) {
    return [];
  }

  const testFiles = files.filter((f) => isTestFile(f, config));
  const sourceFiles = files.filter((f) => !isTestFile(f, config));

  if (sourceFiles.length > 0) {
    return [VITEST_ARGS.RELATED, VITEST_ARGS.RUN, ...sourceFiles];
  }

  return [VITEST_ARGS.RUN, ...testFiles];
}
