export const GIT_ENVIRONMENT_PREFIX = "GIT_";
export const GIT_CEILING_DIRECTORIES_KEY = "GIT_CEILING_DIRECTORIES";

/**
 * Removes Git context and identity variables for read-only commands that must
 * resolve from their own cwd instead of an inherited hook/worktree context.
 * Keeps GIT_CEILING_DIRECTORIES with the value the process environment gave it,
 * so repository discovery stays bounded.
 * Commit and tag callers need an identity-preserving environment instead.
 */
export function withoutGitEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = { ...env };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith(GIT_ENVIRONMENT_PREFIX) && key !== GIT_CEILING_DIRECTORIES_KEY) {
      delete cleaned[key];
    }
  }
  return cleaned;
}
