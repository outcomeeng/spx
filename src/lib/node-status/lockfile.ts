/**
 * The paths of a read set without the product-root dependency lockfiles. A pin holds the lockfile only for a
 * Deterministic or Attested result, so an Agentic result's read set passes through this filter. The caller
 * supplies the lockfile names — the command edge collects them from the registered languages — so the library
 * names no language and a language that declares a lockfile is stripped with no edit here.
 */
export function withoutLockfile(read: readonly string[], lockfileNames: readonly string[]): readonly string[] {
  const names: ReadonlySet<string> = new Set(lockfileNames);
  return read.filter((path) => !names.has(path));
}
