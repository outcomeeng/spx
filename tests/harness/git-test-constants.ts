export const GIT_TEST_COMMAND = "git";

export const GIT_TEST_SUBCOMMANDS = {
  ADD: "add",
  CHECKOUT: "checkout",
  COMMIT: "commit",
  CONFIG: "config",
  INIT: "init",
} as const;

export const GIT_TEST_CONFIG = {
  EMAIL: "test@test.local",
  USER_NAME: "Test User",
} as const;

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
