/**
 * The dependency lockfiles a product root may hold, in the order a run prefers them: the first one present is
 * the product's dependency lockfile.
 */
export const LOCKFILE_NAMES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"] as const;

const LOCKFILE_NAME_SET: ReadonlySet<string> = new Set(LOCKFILE_NAMES);

/**
 * The paths of a read set without the product-root dependency lockfile. A pin holds the lockfile only for a
 * Deterministic or Attested result, so an Agentic result's read set passes through this filter.
 */
export function withoutLockfile(read: readonly string[]): readonly string[] {
  return read.filter((path) => !LOCKFILE_NAME_SET.has(path));
}
