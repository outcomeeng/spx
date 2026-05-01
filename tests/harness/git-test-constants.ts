export const GIT_TEST_COMMAND = "git";

export const GIT_TEST_SUBCOMMANDS = {
  ADD: "add",
  BRANCH: "branch",
  CHECKOUT: "checkout",
  COMMIT: "commit",
  CONFIG: "config",
  INIT: "init",
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

type GitTestEnvironmentKey = (typeof GIT_TEST_ENVIRONMENT_KEYS)[keyof typeof GIT_TEST_ENVIRONMENT_KEYS];

export function cleanGitTestEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const cleaned = { ...env };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith("GIT_")) {
      delete cleaned[key];
    }
  }
  cleaned.GIT_CONFIG_GLOBAL = "/dev/null";
  return cleaned;
}

export async function withGitTestEnvironment(
  values: Readonly<Record<GitTestEnvironmentKey, string>>,
  callback: () => Promise<void>,
): Promise<void> {
  const originalValues = new Map<GitTestEnvironmentKey, string | undefined>();
  for (const key of Object.values(GIT_TEST_ENVIRONMENT_KEYS)) {
    originalValues.set(key, process.env[key]);
    process.env[key] = values[key];
  }

  try {
    await callback();
  } finally {
    for (const key of Object.values(GIT_TEST_ENVIRONMENT_KEYS)) {
      const originalValue = originalValues.get(key);
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  }
}
