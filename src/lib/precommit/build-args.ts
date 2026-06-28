import { PRECOMMIT_DEFAULTS, type PrecommitConfig } from "./config";
import { SPX_TEST_ARGS } from "./spx-test-args";

export const PRECOMMIT_SPX_TEST_ARGS = [
  SPX_TEST_ARGS.COMMAND,
  SPX_TEST_ARGS.CHANGED,
  SPX_TEST_ARGS.STAGED,
  SPX_TEST_ARGS.BASE,
  SPX_TEST_ARGS.BASE_REF,
] as const;

export function isTestFile(filePath: string, config: PrecommitConfig = PRECOMMIT_DEFAULTS): boolean {
  return filePath.includes(config.testPattern);
}

export function buildSpxTestArgs(files: string[], _config: PrecommitConfig = PRECOMMIT_DEFAULTS): string[] {
  if (files.length === 0) {
    return [];
  }

  return [...PRECOMMIT_SPX_TEST_ARGS];
}
