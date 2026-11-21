/**
 * The dependency lockfiles a JavaScript product root may hold, in the order a run prefers them: the first one
 * present is the product's dependency lockfile.
 */
export const JAVASCRIPT_LOCKFILE_NAMES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
] as const;

/** The dependency lockfiles a Python product root may hold. */
export const PYTHON_LOCKFILE_NAMES = ["uv.lock"] as const;

/**
 * The lockfile names a pin strips from an Agentic result's read set: every dependency lockfile any language
 * adapter reads into a read set. Each adapter derives its own lockfile entries from the per-language lists
 * above, so a lockfile an adapter reads is a lockfile the strip removes.
 */
export const LOCKFILE_NAMES = [...JAVASCRIPT_LOCKFILE_NAMES, ...PYTHON_LOCKFILE_NAMES] as const;

const LOCKFILE_NAME_SET: ReadonlySet<string> = new Set(LOCKFILE_NAMES);

/**
 * The paths of a read set without the product-root dependency lockfile. A pin holds the lockfile only for a
 * Deterministic or Attested result, so an Agentic result's read set passes through this filter.
 */
export function withoutLockfile(read: readonly string[]): readonly string[] {
  return read.filter((path) => !LOCKFILE_NAME_SET.has(path));
}
