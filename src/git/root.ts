import { execa } from "execa";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";

import { withoutGitEnvironment } from "./environment";

// Result from product-directory detection.
export interface GitProductDirResult {
  /** Absolute path to product directory (or cwd if not in git repo) */
  productDir: string;
  /** Whether the directory is inside a git repository */
  isGitRepo: boolean;
  /** Warning message when not in a git repo (undefined if in repo) */
  warning?: string;
}

/**
 * Result from Git common-dir product-root detection. Carries the local worktree
 * root (`git rev-parse --show-toplevel`, or `cwd` outside a git repository) as a
 * required field alongside the Git common-dir `productDir`, so a caller that
 * needs both roots reads `--show-toplevel` once.
 */
export interface GitCommonDirProductDirResult extends GitProductDirResult {
  /** The local worktree root — the `--show-toplevel` value, or `cwd` outside a git repository. */
  worktreeRoot: string;
}

/**
 * Git-plumbing observations describing one checkout, gathered by the probe and
 * classified by {@link isMainCheckout}. Every field is a git-plumbing
 * observation normalized at the boundary; no main-checkout classification is
 * performed during gathering.
 */
export interface GitFacts {
  /** The local worktree root — `git rev-parse --show-toplevel`. */
  worktreeRoot: string;
  /** Active non-bare, non-prunable roots observed from `git worktree list --porcelain`. */
  worktreeRoots: readonly string[];
  /** Whether `git worktree list --porcelain` completed successfully. */
  worktreeListRead: boolean;
  /** The absolute common directory — `git rev-parse --git-common-dir`. */
  commonDir: string;
  /** Whether the common directory is a bare repository — `git config --get core.bare` is `true`. */
  commonDirIsBare: boolean;
  /** The `origin` remote URL — `git remote get-url origin` — or null when `origin` is unset. */
  originUrl: string | null;
}

// Minimal command result shape used by product-directory detection.
export interface ExecResult {
  /** Process exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

// Dependencies for git operations.
export interface GitDependencies {
  // Execute a command.
  execa: (
    command: string,
    args: string[],
    options?: { cwd?: string; reject?: boolean },
  ) => Promise<ExecResult>;
}

// Default dependencies using real execa.
export const defaultGitDependencies: GitDependencies = {
  execa: async (command, args, options) => {
    const result = await execa(command, args, {
      ...options,
      env: withoutGitEnvironment(process.env),
      extendEnv: false,
    });
    return {
      exitCode: result.exitCode ?? 0,
      stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
      stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
    };
  },
};

export const NOT_GIT_REPO_WARNING =
  "Warning: Not in a git repository; resolving session storage relative to the current directory.";

export const GIT_ROOT_COMMAND = {
  EXECUTABLE: "git",
  REV_PARSE: "rev-parse",
  ABBREV_REF: "--abbrev-ref",
  GIT_COMMON_DIR: "--git-common-dir",
  HEAD: "HEAD",
  SHOW_TOPLEVEL: "--show-toplevel",
  SYMBOLIC_REF: "symbolic-ref",
  SHOW_REF: "show-ref",
  VERIFY: "--verify",
  QUIET: "--quiet",
  SHORT: "--short",
  ORIGIN_HEAD_REF: "refs/remotes/origin/HEAD",
  STATUS: "status",
  WORKTREE: "worktree",
  LIST: "list",
  PORCELAIN: "--porcelain",
  PATH_FORMAT_ABSOLUTE: "--path-format=absolute",
  CONFIG: "config",
  CONFIG_GET: "--get",
  CONFIG_TYPE_BOOL: "--type=bool",
  CORE_BARE_KEY: "core.bare",
  REMOTE: "remote",
  GET_URL: "get-url",
  ORIGIN: "origin",
  UNTRACKED_FILES_ALL: "--untracked-files=all",
} as const;

/** The `.git` suffix a repository URL or bare directory carries; stripped to recover the repository name. */
export const GIT_URL_SUFFIX = ".git";

/** The basename of a non-bare worktree's local git directory — the common-dir fallback when `--git-common-dir` is unavailable. */
export const GIT_DIR_BASENAME = ".git";

/** Prefix on the remote-tracking ref returned by `symbolic-ref refs/remotes/origin/HEAD`. */
export const ORIGIN_REF_PREFIX = "origin/";

/** The full remote-tracking ref prefix for `origin` branches — the namespace `show-ref --verify` checks for exact existence. */
export const REMOTE_ORIGIN_REF_PREFIX = "refs/remotes/origin/";

/** The `core.bare` config value a bare repository carries; every other value (including unset) is non-bare. */
export const GIT_CORE_BARE_TRUE = "true";

export const GIT_SHOW_TOPLEVEL_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.SHOW_TOPLEVEL,
] as const;

// `--path-format=absolute` makes git emit an absolute common dir regardless of
// the working directory; without it `--git-common-dir` is relative to git's cwd
// (e.g. `../../.git` from a subdirectory), which misresolves against the toplevel.
export const GIT_COMMON_DIR_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.PATH_FORMAT_ABSOLUTE,
  GIT_ROOT_COMMAND.GIT_COMMON_DIR,
] as const;

// `git config --get --type=bool core.bare` reads the shared config the worktrees
// of a bare pool inherit, normalizing every Git boolean spelling (`True`, `yes`,
// `on`, `1`) to `true`/`false` so a non-canonical value is not misread as
// non-bare: it returns `true` from every pool worktree even though
// `--is-bare-repository` returns `false` there, and `false` from a non-bare
// repository's main and linked worktrees alike. It is the signal that separates
// a bare pool (main checkout is the repository-named worktree) from a non-bare
// repository (main checkout is the main working tree).
export const GIT_CORE_BARE_ARGS = [
  GIT_ROOT_COMMAND.CONFIG,
  GIT_ROOT_COMMAND.CONFIG_GET,
  GIT_ROOT_COMMAND.CONFIG_TYPE_BOOL,
  GIT_ROOT_COMMAND.CORE_BARE_KEY,
] as const;

// `git remote get-url origin` reads the `origin` remote URL the worktrees of a
// bare pool share, from which the repository name — the final path segment minus
// a `.git` suffix — is the directory name the pool's main checkout carries.
export const GIT_REMOTE_GET_URL_ORIGIN_ARGS = [
  GIT_ROOT_COMMAND.REMOTE,
  GIT_ROOT_COMMAND.GET_URL,
  GIT_ROOT_COMMAND.ORIGIN,
] as const;

export const GIT_CURRENT_BRANCH_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.ABBREV_REF,
  GIT_ROOT_COMMAND.HEAD,
] as const;

export const GIT_HEAD_SHA_ARGS = [
  GIT_ROOT_COMMAND.REV_PARSE,
  GIT_ROOT_COMMAND.HEAD,
] as const;

export const GIT_ORIGIN_HEAD_REF_ARGS = [
  GIT_ROOT_COMMAND.SYMBOLIC_REF,
  GIT_ROOT_COMMAND.SHORT,
  GIT_ROOT_COMMAND.ORIGIN_HEAD_REF,
] as const;

export const GIT_STATUS_PORCELAIN_ARGS = [
  GIT_ROOT_COMMAND.STATUS,
  GIT_ROOT_COMMAND.PORCELAIN,
  GIT_ROOT_COMMAND.UNTRACKED_FILES_ALL,
] as const;

export const GIT_WORKTREE_LIST_PORCELAIN_ARGS = [
  GIT_ROOT_COMMAND.WORKTREE,
  GIT_ROOT_COMMAND.LIST,
  GIT_ROOT_COMMAND.PORCELAIN,
] as const;

export const GIT_WORKTREE_PORCELAIN_ROOT_PREFIX = "worktree ";
export const GIT_WORKTREE_PORCELAIN_BRANCH_PREFIX = "branch refs/heads/";
export const GIT_WORKTREE_PORCELAIN_BARE_LINE = "bare";
export const GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE = "prunable";
export const GIT_WORKTREE_PORCELAIN_PRUNABLE_PREFIX = `${GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE} `;
const POSIX_PATH_SEPARATOR = "/";
const WINDOWS_PATH_SEPARATOR = "\\";

// Detects the local worktree product directory.
export async function detectWorktreeProductRoot(
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<GitProductDirResult> {
  try {
    const result = await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [...GIT_SHOW_TOPLEVEL_ARGS],
      { cwd, reject: false },
    );

    // Git command succeeded - we're in a repo
    if (result.exitCode === 0 && result.stdout) {
      return {
        productDir: extractStdout(result.stdout),
        isGitRepo: true,
      };
    }

    // Git command failed - not in a repo
    return {
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
    };
  } catch {
    // Command execution failed (git not installed, permission error, etc.)
    return {
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
    };
  }
}

function stripTrailingPathSeparators(value: string): string {
  let end = value.length;
  while (
    end > 0
    && (value[end - 1] === POSIX_PATH_SEPARATOR || value[end - 1] === WINDOWS_PATH_SEPARATOR)
  ) {
    end -= 1;
  }
  return value.slice(0, end);
}

// Extracts a trimmed string from execa stdout.
function extractStdout(stdout: string): string {
  if (!stdout) return "";
  return stripTrailingPathSeparators(stdout.trim());
}

function trimStdout(stdout: string): string {
  if (!stdout) return "";
  return stdout.trim();
}

// Detects the Git common-dir product root, resolving through git worktrees.
export async function detectGitCommonDirProductRoot(
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<GitCommonDirProductDirResult> {
  try {
    // Step 1: Get the local worktree product directory via --show-toplevel
    const toplevelResult = await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [...GIT_SHOW_TOPLEVEL_ARGS],
      { cwd, reject: false },
    );

    if (toplevelResult.exitCode !== 0 || !toplevelResult.stdout) {
      return {
        productDir: cwd,
        isGitRepo: false,
        warning: NOT_GIT_REPO_WARNING,
        worktreeRoot: cwd,
      };
    }

    const toplevel = extractStdout(toplevelResult.stdout);

    // Step 2: Get the common git directory via --git-common-dir
    const commonDirResult = await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [...GIT_COMMON_DIR_ARGS],
      { cwd, reject: false },
    );

    if (commonDirResult.exitCode !== 0 || !commonDirResult.stdout) {
      // Fallback: if --git-common-dir fails, use toplevel
      return {
        productDir: toplevel,
        isGitRepo: true,
        worktreeRoot: toplevel,
      };
    }

    const commonDir = extractStdout(commonDirResult.stdout);

    // Step 3: Resolve the common dir to an absolute path. GIT_COMMON_DIR_ARGS
    // requests --path-format=absolute, so git emits an absolute path; the
    // relative branch is a defensive fallback for git builds that ignore it.
    const absoluteCommonDir = isAbsolute(commonDir)
      ? commonDir
      : resolve(toplevel, commonDir);

    // Step 4: The Git common-dir product root is the parent of the common .git directory
    const gitCommonDirProductRoot = dirname(absoluteCommonDir);

    return {
      productDir: gitCommonDirProductRoot,
      isGitRepo: true,
      worktreeRoot: toplevel,
    };
  } catch {
    return {
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING,
      worktreeRoot: cwd,
    };
  }
}

/**
 * Resolves the repository's default branch name from `origin/HEAD`
 * (e.g. `"main"`). Returns null when `origin/HEAD` is unset or unresolvable.
 */
export async function resolveDefaultBranch(
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_ORIGIN_HEAD_REF_ARGS],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const ref = extractStdout(result.stdout);
  if (!ref.startsWith(ORIGIN_REF_PREFIX)) return null;
  const branch = ref.slice(ORIGIN_REF_PREFIX.length);
  return branch.length === 0 ? null : branch;
}

/**
 * Returns the checked-out branch name, or null when HEAD is detached or the
 * branch name is unavailable.
 */
export async function getCurrentBranch(
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_CURRENT_BRANCH_ARGS],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const branch = extractStdout(result.stdout);
  if (branch.length === 0 || branch === GIT_ROOT_COMMAND.HEAD) return null;
  return branch;
}

/** Returns the HEAD commit SHA, or null when unavailable. */
export async function getHeadSha(
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_HEAD_SHA_ARGS],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const sha = extractStdout(result.stdout);
  return sha.length === 0 ? null : sha;
}

/**
 * Returns the commit SHA at the tip of the given ref (e.g. `"origin/main"`),
 * or null when the ref cannot be resolved.
 */
export async function resolveRefSha(
  ref: string,
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_ROOT_COMMAND.REV_PARSE, ref],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const sha = extractStdout(result.stdout);
  return sha.length === 0 ? null : sha;
}

/**
 * Whether `branch` names an exact remote-tracking branch on `origin` —
 * `git show-ref --verify --quiet refs/remotes/origin/<branch>` exits zero.
 *
 * `show-ref --verify` matches the full ref path literally and applies no
 * revision-expression syntax, so a revision expression like `main~1` or
 * `main^{commit}`, or a bare SHA, never matches an existing remote branch —
 * the check verifies a branch, not a resolvable revision.
 *
 * `HEAD` is excluded explicitly: `refs/remotes/origin/HEAD` is the symbolic
 * default-branch pointer, the one non-branch entry in the `refs/remotes/origin/`
 * namespace, so a literal `HEAD` (which a detached worktree's
 * `rev-parse --abbrev-ref HEAD` yields) is not a work branch.
 */
export async function originBranchExists(
  branch: string,
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<boolean> {
  if (branch === GIT_ROOT_COMMAND.HEAD) return false;
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [
      GIT_ROOT_COMMAND.SHOW_REF,
      GIT_ROOT_COMMAND.VERIFY,
      GIT_ROOT_COMMAND.QUIET,
      `${REMOTE_ORIGIN_REF_PREFIX}${branch}`,
    ],
    { cwd, reject: false },
  );
  return result.exitCode === 0;
}

/**
 * Whether the working tree at `cwd` is clean — `git status --porcelain` emits
 * nothing. A non-zero git exit is treated as not clean.
 */
export async function isWorkingTreeClean(
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<boolean> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [...GIT_STATUS_PORCELAIN_ARGS],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return false;
  return extractStdout(result.stdout).length === 0;
}

/**
 * The repository name an `origin` URL carries — its final path segment with a
 * trailing `.git` removed — or null when the URL is absent or carries no name.
 *
 * Pure and total: parses every URL form git accepts (`https://host/owner/repo.git`,
 * `git@host:owner/repo.git`, a local path, with or without the `.git` suffix or a
 * trailing slash) by taking the segment after the last `/`, `\`, or `:` separator.
 */
export function repositoryName(originUrl: string | null): string | null {
  if (originUrl === null) return null;
  const trimmed = stripTrailingPathSeparators(originUrl.trim());
  const lastSeparator = Math.max(
    trimmed.lastIndexOf("/"),
    trimmed.lastIndexOf("\\"),
    trimmed.lastIndexOf(":"),
  );
  const segment = trimmed.slice(lastSeparator + 1);
  const name = segment.endsWith(GIT_URL_SUFFIX)
    ? segment.slice(0, -GIT_URL_SUFFIX.length)
    : segment;
  return name.length === 0 ? null : name;
}

export function normalizeGitPath(path: string): string {
  return stripTrailingPathSeparators(path.trim());
}

function normalizedGitPathKey(path: string): string {
  return normalizeGitPath(path).replaceAll(WINDOWS_PATH_SEPARATOR, POSIX_PATH_SEPARATOR);
}

function isObservedWorktreeRoot(worktreeRoots: readonly string[], candidate: string): boolean {
  const candidateKey = normalizedGitPathKey(candidate);
  return worktreeRoots.some((root) => normalizedGitPathKey(root) === candidateKey);
}

function isPrunableWorktreeRecordLine(line: string): boolean {
  return line === GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE
    || line.startsWith(GIT_WORKTREE_PORCELAIN_PRUNABLE_PREFIX);
}

function parseWorktreeRoots(stdout: string): string[] {
  const roots: string[] = [];
  for (const record of stdout.split(/\n\n+/)) {
    const lines = record.split("\n");
    if (
      lines.includes(GIT_WORKTREE_PORCELAIN_BARE_LINE)
      || lines.some(isPrunableWorktreeRecordLine)
    ) continue;
    const rootLine = lines.find((line) => line.startsWith(GIT_WORKTREE_PORCELAIN_ROOT_PREFIX));
    if (rootLine === undefined) continue;
    const root = normalizeGitPath(rootLine.slice(GIT_WORKTREE_PORCELAIN_ROOT_PREFIX.length));
    if (root.length > 0) roots.push(root);
  }
  return roots;
}

function observedWorktreeRoots(worktreeListResult: ExecResult): string[] {
  if (worktreeListResult.exitCode !== 0) return [];
  return [...new Set(parseWorktreeRoots(worktreeListResult.stdout))];
}

/**
 * Whether the observed {@link GitFacts} identify the repository's main checkout.
 *
 * Pure and total: a non-bare repository's main working tree — the parent of its
 * common directory — is the main checkout whatever branch it holds and whether
 * or not it has linked worktrees; a bare-repository pool worktree is the main
 * checkout exactly when its common directory sits beside the worktree, its
 * directory basename equals the `origin` repository name, and git reports the
 * worktree root in the observed worktree list. The verdict reads no branch.
 */
export function isMainCheckout(facts: GitFacts): boolean {
  const commonDirParent = dirname(facts.commonDir);
  // Non-bare repository: only the main working tree — the parent of the common
  // directory — is the main checkout, whatever branch it holds and whether or
  // not the repository has linked worktrees.
  if (!facts.commonDirIsBare) return commonDirParent === facts.worktreeRoot;
  // Bare-repository pool: the common directory is a sibling of the worktree, and
  // the worktree directory is named after the `origin` repository.
  if (commonDirParent !== dirname(facts.worktreeRoot)) return false;
  const name = repositoryName(facts.originUrl);
  return name !== null
    && basename(facts.worktreeRoot) === name
    && facts.worktreeListRead
    && isObservedWorktreeRoot(facts.worktreeRoots, facts.worktreeRoot);
}

/**
 * The absolute path of the repository's main checkout designated by the observed
 * {@link GitFacts}, or null when no main checkout is designable.
 *
 * Pure and total: a non-bare repository designates its main working tree — the
 * parent of the common directory — from any of its worktrees; a bare-repository
 * pool designates the `origin`-repository-named worktree beside the bare
 * repository (the parent of the common directory joined with the repository name)
 * only when that worktree is observed, and designates no path when the pool
 * resolves no repository name or the repository-named worktree does not exist.
 */
export function mainCheckoutPath(facts: GitFacts): string | null {
  const commonDirParent = dirname(facts.commonDir);
  // Non-bare repository: the main checkout is the main working tree — the parent
  // of the common directory — reachable from any of its worktrees.
  if (!facts.commonDirIsBare) return commonDirParent;
  // Bare-repository pool: invert the name-and-placement rule to construct the path.
  const name = repositoryName(facts.originUrl);
  if (name === null) return null;
  if (!facts.worktreeListRead) return null;
  const candidate = join(commonDirParent, name);
  return isObservedWorktreeRoot(facts.worktreeRoots, candidate) ? candidate : null;
}

/**
 * Reads the {@link GitFacts} for `cwd` through the injected git runner. Returns
 * null only when `cwd` is outside a git repository — `git rev-parse
 * --show-toplevel` fails. When `--show-toplevel` succeeds but `--git-common-dir`
 * does not, it falls back to a non-bare single-tree shape (common dir
 * `<worktreeRoot>/.git`) so detection agrees with `detectGitCommonDirProductRoot`,
 * which falls back to the toplevel on the same failure.
 */
export async function gatherGitFacts(
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<GitFacts | null> {
  try {
    // The toplevel, common-dir, and origin reads are independent, so they run in
    // one round-trip; only the bareness check depends on common-dir succeeding.
    const [toplevelResult, commonDirResult, originResult, worktreeListResult] = await Promise.all([
      deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_SHOW_TOPLEVEL_ARGS], { cwd, reject: false }),
      deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_COMMON_DIR_ARGS], { cwd, reject: false }),
      deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_REMOTE_GET_URL_ORIGIN_ARGS], { cwd, reject: false }),
      deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_WORKTREE_LIST_PORCELAIN_ARGS], { cwd, reject: false }),
    ]);
    if (toplevelResult.exitCode !== 0 || !toplevelResult.stdout) return null;

    const worktreeRoot = extractStdout(toplevelResult.stdout);
    const worktreeListRead = worktreeListResult.exitCode === 0;
    const worktreeRoots = observedWorktreeRoots(worktreeListResult);
    const originUrl = originResult.exitCode === 0 && originResult.stdout
      ? trimStdout(originResult.stdout)
      : null;

    // Mirror the `--git-common-dir` fallback of detectGitCommonDirProductRoot: a
    // worktree whose common dir cannot be read is treated as a non-bare single
    // tree rooted at the worktree, so both resolvers agree rather than this one
    // alone reporting "not a checkout".
    if (commonDirResult.exitCode !== 0 || !commonDirResult.stdout) {
      return {
        worktreeRoot,
        worktreeRoots,
        worktreeListRead,
        commonDir: join(worktreeRoot, GIT_DIR_BASENAME),
        commonDirIsBare: false,
        originUrl,
      };
    }

    const rawCommonDir = extractStdout(commonDirResult.stdout);
    const commonDir = isAbsolute(rawCommonDir) ? rawCommonDir : resolve(worktreeRoot, rawCommonDir);
    const bareResult = await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [...GIT_CORE_BARE_ARGS],
      { cwd, reject: false },
    );
    const commonDirIsBare = bareResult.exitCode === 0
      && extractStdout(bareResult.stdout) === GIT_CORE_BARE_TRUE;
    return { worktreeRoot, worktreeRoots, worktreeListRead, commonDir, commonDirIsBare, originUrl };
  } catch {
    // Command execution failed (git not installed, permission error, etc.) —
    // the checkout cannot be classified, so it is not the main checkout.
    return null;
  }
}

/**
 * Whether the checkout at `cwd` is the repository's main checkout, composing the
 * probe with {@link isMainCheckout}. A `cwd` outside a git repository is not the
 * main checkout.
 */
export async function detectMainCheckout(
  cwd: string = CONFIG_PROCESS_CWD.read(),
  deps: GitDependencies = defaultGitDependencies,
): Promise<boolean> {
  const facts = await gatherGitFacts(cwd, deps);
  if (facts === null) return false;
  return isMainCheckout(facts);
}
