import { isAbsolute, relative, resolve, sep } from "node:path";

const PARENT_DIRECTORY = "..";

/**
 * Whether `candidate` resolves within `root`. The candidate is resolved against
 * `root`, then the result is contained when its path relative to `root` neither
 * steps above `root` (a parent-directory traversal) nor lands on an absolute path
 * outside it. A directory whose name merely begins with `..` (such as `..foo`) is
 * contained — only a `..` segment escapes.
 */
export function isPathContained(root: string, candidate: string): boolean {
  const relativeToRoot = relative(root, resolve(root, candidate));
  return relativeToRoot !== PARENT_DIRECTORY
    && !relativeToRoot.startsWith(`${PARENT_DIRECTORY}${sep}`)
    && !isAbsolute(relativeToRoot);
}
