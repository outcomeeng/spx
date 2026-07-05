import { isAbsolute, relative, resolve, sep, win32 } from "node:path";

export const PATH_CONTAINMENT_PARENT_DIRECTORY = "..";
export const PATH_CONTAINMENT_ROOT_CANDIDATE = "";
const WINDOWS_DRIVE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;

/**
 * Whether `candidate` resolves within `root`. The candidate is resolved against
 * `root`, then the result is contained when its path relative to `root` neither
 * steps above `root` (a parent-directory traversal) nor lands on an absolute path
 * outside it. A directory whose name merely begins with `..` (such as `..foo`) is
 * contained — only a `..` segment escapes.
 */
export function isPathContained(root: string, candidate: string): boolean {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(root)) {
    return isResolvedPathContained(
      win32.relative(root, win32.resolve(root, candidate)),
      win32.sep,
      win32.isAbsolute,
    );
  }
  return isResolvedPathContained(relative(root, resolve(root, candidate)), sep, isAbsolute);
}

function isResolvedPathContained(
  relativeToRoot: string,
  pathSeparator: string,
  isAbsolutePath: (path: string) => boolean,
): boolean {
  return relativeToRoot !== PATH_CONTAINMENT_PARENT_DIRECTORY
    && !relativeToRoot.startsWith(`${PATH_CONTAINMENT_PARENT_DIRECTORY}${pathSeparator}`)
    && !isAbsolutePath(relativeToRoot);
}
