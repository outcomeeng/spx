/**
 * Removes Git context and identity variables for read-only commands that must
 * resolve from their own cwd instead of an inherited hook/worktree context.
 */
export function withoutGitEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = { ...env };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith("GIT_")) {
      delete cleaned[key];
    }
  }
  return cleaned;
}
