import { categorizeFile, FILE_CATEGORIES } from "./categorize";
import { PRECOMMIT_DEFAULTS, type PrecommitConfig } from "./config";
import { SPX_TEST_ARGS } from "./spx-test-args";
import { VITEST_ARGS } from "./vitest-args";

export const PRECOMMIT_SPX_TEST_ARGS = [
  SPX_TEST_ARGS.COMMAND,
  SPX_TEST_ARGS.CHANGED,
  SPX_TEST_ARGS.STAGED,
  SPX_TEST_ARGS.BASE,
  SPX_TEST_ARGS.BASE_REF,
] as const;

export const PRECOMMIT_TEST_RUNNERS = {
  SPX: "spx",
  VITEST: "vitest",
} as const;

export type PrecommitTestRunner = (typeof PRECOMMIT_TEST_RUNNERS)[keyof typeof PRECOMMIT_TEST_RUNNERS];

export interface PrecommitTestInvocation {
  readonly runner: PrecommitTestRunner;
  readonly args: readonly string[];
}

export function isTestFile(filePath: string, config: PrecommitConfig = PRECOMMIT_DEFAULTS): boolean {
  return filePath.includes(config.testPattern);
}

function arrayValuesEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function isDefaultPrecommitConfig(config: PrecommitConfig = PRECOMMIT_DEFAULTS): boolean {
  return config.testPattern === PRECOMMIT_DEFAULTS.testPattern
    && arrayValuesEqual(config.sourceDirs, PRECOMMIT_DEFAULTS.sourceDirs);
}

export function buildSpxTestArgs(files: string[], _config: PrecommitConfig = PRECOMMIT_DEFAULTS): string[] {
  if (files.length === 0) {
    return [];
  }

  return [...PRECOMMIT_SPX_TEST_ARGS];
}

export function hasConfigFile(files: readonly string[], config: PrecommitConfig = PRECOMMIT_DEFAULTS): boolean {
  return files.some((file) => categorizeFile(file, config) === FILE_CATEGORIES.CONFIG);
}

export function buildVitestArgs(files: string[], config: PrecommitConfig = PRECOMMIT_DEFAULTS): string[] {
  if (files.length === 0) {
    return [];
  }

  const testFiles = files.filter((file) => categorizeFile(file, config) === FILE_CATEGORIES.TEST);
  const sourceFiles = files.filter((file) => categorizeFile(file, config) === FILE_CATEGORIES.SOURCE);

  if (sourceFiles.length > 0) {
    return [VITEST_ARGS.RELATED, VITEST_ARGS.RUN, ...sourceFiles];
  }

  return testFiles.length > 0 ? [VITEST_ARGS.RUN, ...testFiles] : [];
}

export function buildPrecommitTestInvocation(
  files: string[],
  config: PrecommitConfig = PRECOMMIT_DEFAULTS,
): PrecommitTestInvocation {
  return isDefaultPrecommitConfig(config) || hasConfigFile(files, config)
    ? { runner: PRECOMMIT_TEST_RUNNERS.SPX, args: buildSpxTestArgs(files, config) }
    : { runner: PRECOMMIT_TEST_RUNNERS.VITEST, args: buildVitestArgs(files, config) };
}
