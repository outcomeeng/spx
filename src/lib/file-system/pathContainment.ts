import { dirname, isAbsolute, relative, resolve, sep, win32 } from "node:path";

export const PATH_CONTAINMENT_PARENT_DIRECTORY = "..";
export const PATH_CONTAINMENT_ROOT_CANDIDATE = "";
const WINDOWS_DRIVE_ROOT_PATTERN = /^[a-zA-Z]:[\\/]/;
const WINDOWS_UNC_ROOT_PATTERN = /^[/\\]{2}(?![.?][\\/])[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/;
const WINDOWS_EXTENDED_LENGTH_ROOT_PATTERN =
  /^[/\\]{2}\?[\\/](?:[a-zA-Z]:[\\/]|UNC[\\/][^\\/]+[\\/][^\\/]+(?:[\\/]|$))/;

export interface NearestExistingCanonicalPath {
  readonly path: string;
  readonly checkedPath: string;
  readonly isCandidate: boolean;
}

export type PathCanonicalizer = (path: string) => string | undefined | Promise<string | undefined>;

/**
 * Whether `candidate` resolves within `root`. The candidate is resolved against
 * `root`, then the result is contained when its path relative to `root` neither
 * steps above `root` (a parent-directory traversal) nor lands on an absolute path
 * outside it. A directory whose name merely begins with `..` (such as `..foo`) is
 * contained — only a `..` segment escapes.
 */
export function isPathContained(root: string, candidate: string): boolean {
  if (usesWindowsPathSemantics(root)) {
    return isResolvedPathContained(
      win32.relative(root, win32.resolve(root, candidate)),
      win32.sep,
      win32.isAbsolute,
    );
  }
  return isResolvedPathContained(relative(root, resolve(root, candidate)), sep, isAbsolute);
}

export async function nearestExistingCanonicalPath(
  path: string,
  canonicalizePath: PathCanonicalizer,
): Promise<NearestExistingCanonicalPath | undefined> {
  let candidate = path;
  let isCandidate = true;
  for (;;) {
    const canonicalPath = await canonicalizePath(candidate);
    if (canonicalPath !== undefined) {
      return { path: canonicalPath, checkedPath: candidate, isCandidate };
    }
    const parent = dirname(candidate);
    if (parent === candidate) {
      return undefined;
    }
    candidate = parent;
    isCandidate = false;
  }
}

export function canonicalTargetPath(
  canonicalPath: NearestExistingCanonicalPath,
  candidatePath: string,
): string {
  if (canonicalPath.isCandidate) {
    return canonicalPath.path;
  }
  return resolve(
    canonicalPath.path,
    relative(canonicalPath.checkedPath, candidatePath),
  );
}

function usesWindowsPathSemantics(root: string): boolean {
  return WINDOWS_DRIVE_ROOT_PATTERN.test(root)
    || WINDOWS_UNC_ROOT_PATTERN.test(root)
    || WINDOWS_EXTENDED_LENGTH_ROOT_PATTERN.test(root);
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
