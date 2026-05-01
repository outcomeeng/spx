export function withoutGitEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = { ...env };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith("GIT_")) {
      delete cleaned[key];
    }
  }
  return cleaned;
}
