import { join } from "node:path";

import { execa } from "execa";

import { withoutGitEnvironment } from "@/lib/git/environment";

export const GIT_TEST_COMMAND = "git";

export const GIT_TEST_SUBCOMMANDS = {
  ADD: "add",
  BRANCH: "branch",
  CHECKOUT: "checkout",
  CLONE: "clone",
  COMMIT: "commit",
  CONFIG: "config",
  INIT: "init",
  LS_FILES: "ls-files",
  REV_PARSE: "rev-parse",
  SUBMODULE: "submodule",
  SYMBOLIC_REF: "symbolic-ref",
  TAG: "tag",
  UPDATE_REF: "update-ref",
  WORKTREE: "worktree",
} as const;

export const GIT_TEST_FLAGS = {
  ALLOW_EMPTY: "--allow-empty",
  BARE: "--bare",
  CACHED: "--cached",
  COMMIT_MESSAGE: "-m",
  CONFIG_OVERRIDE: "-c",
  DETACH: "--detach",
  EXCLUDE_STANDARD: "--exclude-standard",
  FULL_NAME: "--full-name",
  IS_INSIDE_WORK_TREE: "--is-inside-work-tree",
  NEW_BRANCH: "-b",
  OTHERS: "--others",
  QUIET: "--quiet",
  REMOVE_SECTION: "--remove-section",
  SHOW_CURRENT: "--show-current",
} as const;

export const GIT_TEST_REF = {
  /** Prefix on the full remote-tracking ref path for the `origin` remote. */
  REMOTE_ORIGIN_PREFIX: "refs/remotes/origin/",
  /** Name component `origin/HEAD` carries — the symbolic ref naming the default branch. */
  HEAD_NAME: "HEAD",
} as const;

export const GIT_TEST_OUTPUT = {
  IS_INSIDE_WORK_TREE_TRUE: "true",
  MISSING_ENV_VALUE: "missing",
} as const;

export const GIT_TEST_EXECUTABLE = {
  NODE: "node",
} as const;

export const GIT_TEST_CONFIG = {
  EMAIL: "test@test.local",
  EMAIL_KEY: "user.email",
  ORIGIN_SECTION: "remote.origin",
  ORIGIN_URL_KEY: "remote.origin.url",
  USER_NAME: "Test User",
  USER_NAME_KEY: "user.name",
} as const;

export const GIT_TEST_ENVIRONMENT_KEYS = {
  AUTHOR_NAME: "GIT_AUTHOR_NAME",
  COMMITTER_EMAIL: "GIT_COMMITTER_EMAIL",
  DIR: "GIT_DIR",
  WORK_TREE: "GIT_WORK_TREE",
} as const;

const TEST_TYPESCRIPT_RUNNER_RELATIVE_PATH = ["node_modules", ".bin", "tsx"] as const;
const TEST_TYPESCRIPT_EXECUTION_ARGS = ["--input-type=module", "--eval"] as const;

export type GitTestEnvironmentOverrides = Readonly<Record<string, string>>;

export const GITHUB_ACTIONS_REPORTER_TRIGGER_KEY = "GITHUB_ACTIONS";

export function cleanGitTestEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const cleaned = withoutGitEnvironment(env);
  // Fixture repositories should not inherit a developer's global identity or hooks.
  cleaned.GIT_CONFIG_GLOBAL = "/dev/null";
  // vitest activates its GitHub-Actions reporter on GITHUB_ACTIONS=true; strip it so subprocess runs do not post annotations to the parent CI run.
  delete cleaned[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY];
  return cleaned;
}

export function gitArgsEqual(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function buildGitTestEnvironment(
  envOverrides: GitTestEnvironmentOverrides = {},
): NodeJS.ProcessEnv {
  return cleanGitTestEnvironment({ ...process.env, ...envOverrides });
}

export async function runGit(
  cwd: string,
  args: readonly string[],
  envOverrides: GitTestEnvironmentOverrides = {},
): Promise<void> {
  await execa(GIT_TEST_COMMAND, [...args], {
    cwd,
    env: buildGitTestEnvironment(envOverrides),
    extendEnv: false,
  });
}

export async function readGit(
  cwd: string,
  args: readonly string[],
  envOverrides: GitTestEnvironmentOverrides = {},
): Promise<string> {
  const result = await execa(GIT_TEST_COMMAND, [...args], {
    cwd,
    env: buildGitTestEnvironment(envOverrides),
    extendEnv: false,
  });
  return result.stdout.trim();
}

export async function runTsxEval(
  productDir: string,
  script: string,
  envOverrides: GitTestEnvironmentOverrides = {},
  executionDir: string = productDir,
): Promise<string> {
  // Invoke the tsx binary directly rather than through `pnpm exec`. Under
  // `pnpm exec`, pnpm's dependency verification prints "Already up to date" to
  // stdout (unless an ancestor pnpm process suppresses it), which corrupts the
  // JSON a caller parses from the script's stdout. `productDir` is the product root,
  // where node_modules lives.
  const tsxBinary = join(productDir, ...TEST_TYPESCRIPT_RUNNER_RELATIVE_PATH);
  const result = await execa(tsxBinary, [...TEST_TYPESCRIPT_EXECUTION_ARGS, script], {
    cwd: executionDir,
    env: {
      ...buildGitTestEnvironment(),
      ...envOverrides,
    },
    extendEnv: false,
  });
  return result.stdout.trim();
}

export async function runTsxFile(
  cwd: string,
  scriptPath: string,
  envOverrides: GitTestEnvironmentOverrides = {},
): Promise<void> {
  const tsxBinary = join(cwd, ...TEST_TYPESCRIPT_RUNNER_RELATIVE_PATH);
  await execa(tsxBinary, [scriptPath], {
    cwd,
    env: {
      ...buildGitTestEnvironment(),
      ...envOverrides,
    },
    extendEnv: false,
  });
}
