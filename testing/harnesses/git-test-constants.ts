import { execa } from "execa";

import { withoutGitEnvironment } from "@/git/environment";

export const GIT_TEST_COMMAND = "git";

export const GIT_TEST_SUBCOMMANDS = {
  ADD: "add",
  BRANCH: "branch",
  CHECKOUT: "checkout",
  COMMIT: "commit",
  CONFIG: "config",
  INIT: "init",
  WORKTREE: "worktree",
} as const;

export const GIT_TEST_FLAGS = {
  ALLOW_EMPTY: "--allow-empty",
  SHOW_CURRENT: "--show-current",
} as const;

export const GIT_TEST_CONFIG = {
  EMAIL: "test@test.local",
  USER_NAME: "Test User",
} as const;

export const GIT_TEST_ENVIRONMENT_KEYS = {
  DIR: "GIT_DIR",
  WORK_TREE: "GIT_WORK_TREE",
} as const;

const TEST_PACKAGE_MANAGER_COMMAND = "pnpm";
const TEST_TYPESCRIPT_EXECUTION_ARGS = ["exec", "tsx", "--input-type=module", "--eval"] as const;

export type GitTestEnvironmentOverrides = Readonly<Record<string, string>>;

export function cleanGitTestEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const cleaned = withoutGitEnvironment(env);
  // Fixture repositories should not inherit a developer's global identity or hooks.
  cleaned.GIT_CONFIG_GLOBAL = "/dev/null";
  return cleaned;
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
  cwd: string,
  script: string,
  envOverrides: GitTestEnvironmentOverrides = {},
): Promise<string> {
  const result = await execa(TEST_PACKAGE_MANAGER_COMMAND, [...TEST_TYPESCRIPT_EXECUTION_ARGS, script], {
    cwd,
    env: {
      ...buildGitTestEnvironment(),
      ...envOverrides,
    },
    extendEnv: false,
  });
  return result.stdout.trim();
}
