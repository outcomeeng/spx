import { execa } from "execa";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { withoutGitEnvironment } from "@/lib/git/environment";

export const OPERAND_SPELLING = {
  ABSOLUTE: "absolute",
  FROM_INVOCATION_DIRECTORY: "from-invocation-directory",
  FROM_WORKTREE_ROOT: "from-worktree-root",
  PATH_SUFFIX: "path-suffix",
} as const;

export type OperandSpelling = (typeof OPERAND_SPELLING)[keyof typeof OPERAND_SPELLING];

export const VERIFICATION_INPUT_REJECTION = {
  UNRESOLVED: "unresolved",
  AMBIGUOUS: "ambiguous",
  NOT_REGULAR_FILE: "not-regular-file",
  UNREADABLE: "unreadable",
  OUTSIDE_ROOT_TRAVERSAL: "outside-root-traversal",
  OUTSIDE_ROOT_SYMLINK: "outside-root-symlink",
  INVALID_UTF8: "invalid-utf8",
} as const;

export type VerificationInputRejection =
  (typeof VERIFICATION_INPUT_REJECTION)[keyof typeof VERIFICATION_INPUT_REJECTION];

const GIT_EXECUTABLE = "git";
const GIT_LIST_FILES_ARGS = ["ls-files", "--cached", "--others", "--exclude-standard", "-z"] as const;
const GIT_SUCCESS_EXIT_CODE = 0;
const NUL = "\0";
const POSIX_SEPARATOR = "/";
const PARENT_SEGMENT = "..";

export type ListProductFiles = (worktreeRoot: string) => Promise<readonly string[]>;

export async function listProductFilesWithGit(worktreeRoot: string): Promise<readonly string[]> {
  try {
    const result = await execa(GIT_EXECUTABLE, [...GIT_LIST_FILES_ARGS], {
      cwd: worktreeRoot,
      reject: false,
      env: withoutGitEnvironment(process.env),
      extendEnv: false,
    });
    if (result.exitCode !== GIT_SUCCESS_EXIT_CODE) return [];
    return String(result.stdout).split(NUL).filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

export interface OperandRequest {
  readonly operand: string;
  readonly invocationDir: string;
  readonly worktreeRoot: string;
}

export type OperandResolution =
  | { readonly ok: true; readonly absolutePath: string; readonly path: string }
  | {
    readonly ok: false;
    readonly reason:
      | typeof VERIFICATION_INPUT_REJECTION.UNRESOLVED
      | typeof VERIFICATION_INPUT_REJECTION.AMBIGUOUS
      | typeof VERIFICATION_INPUT_REJECTION.OUTSIDE_ROOT_TRAVERSAL
      | typeof VERIFICATION_INPUT_REJECTION.OUTSIDE_ROOT_SYMLINK;
  };

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  const escapesRoot = rel === PARENT_SEGMENT || rel.startsWith(PARENT_SEGMENT + sep) || isAbsolute(rel);
  return !escapesRoot;
}

function hasComponentSuffix(file: string, operandComponents: readonly string[]): boolean {
  const components = file.split(POSIX_SEPARATOR);
  if (operandComponents.length > components.length) return false;
  const tail = components.slice(components.length - operandComponents.length);
  return tail.every((component, index) => component === operandComponents[index]);
}

async function existingRealpath(candidate: string): Promise<string | undefined> {
  try {
    await lstat(candidate);
    return await realpath(candidate);
  } catch {
    return undefined;
  }
}

async function collectCandidates(
  request: OperandRequest,
  lexicalRoot: string,
  listFiles: ListProductFiles,
): Promise<Set<string>> {
  const { operand, invocationDir } = request;
  const candidates = new Set<string>();
  if (isAbsolute(operand)) {
    candidates.add(resolve(operand));
    return candidates;
  }
  candidates.add(resolve(invocationDir, operand));
  candidates.add(resolve(lexicalRoot, operand));
  const components = operand.split(sep).join(POSIX_SEPARATOR).split(POSIX_SEPARATOR).filter((c) => c.length > 0);
  if (components.length === 0 || components.includes(PARENT_SEGMENT)) return candidates;
  for (const file of await listFiles(lexicalRoot)) {
    if (hasComponentSuffix(file, components)) candidates.add(join(lexicalRoot, file));
  }
  return candidates;
}

interface CandidateClassification {
  readonly identities: ReadonlySet<string>;
  readonly sawTraversal: boolean;
  readonly sawSymlinkEscape: boolean;
}

async function classifyCandidates(
  candidates: ReadonlySet<string>,
  lexicalRoot: string,
  realRoot: string,
): Promise<CandidateClassification> {
  let sawTraversal = false;
  let sawSymlinkEscape = false;
  const identities = new Set<string>();
  for (const candidate of candidates) {
    if (!isInside(lexicalRoot, candidate) && !isInside(realRoot, candidate)) {
      sawTraversal = true;
      continue;
    }
    const real = await existingRealpath(candidate);
    if (real === undefined) continue;
    if (isInside(realRoot, real)) identities.add(real);
    else sawSymlinkEscape = true;
  }
  return { identities, sawTraversal, sawSymlinkEscape };
}

function rejectionWithoutIdentity(
  classification: CandidateClassification,
): Extract<OperandResolution, { ok: false }> {
  if (classification.sawSymlinkEscape) {
    return { ok: false, reason: VERIFICATION_INPUT_REJECTION.OUTSIDE_ROOT_SYMLINK };
  }
  if (classification.sawTraversal) {
    return { ok: false, reason: VERIFICATION_INPUT_REJECTION.OUTSIDE_ROOT_TRAVERSAL };
  }
  return { ok: false, reason: VERIFICATION_INPUT_REJECTION.UNRESOLVED };
}

/**
 * Resolves a caller-supplied operand to one product file identity: lexical candidates from the
 * operand, the invocation directory, the worktree root, and complete-component suffix matches over
 * the files git lists; candidates outside the root are discarded and the rest collapse by identity.
 */
export async function resolveOperand(
  request: OperandRequest,
  listFiles: ListProductFiles = listProductFilesWithGit,
): Promise<OperandResolution> {
  const lexicalRoot = resolve(request.worktreeRoot);
  const realRoot = await realpath(lexicalRoot);
  const candidates = await collectCandidates(request, lexicalRoot, listFiles);
  const classification = await classifyCandidates(candidates, lexicalRoot, realRoot);

  if (classification.identities.size > 1) return { ok: false, reason: VERIFICATION_INPUT_REJECTION.AMBIGUOUS };
  const first = classification.identities.values().next();
  if (first.done) return rejectionWithoutIdentity(classification);
  const only = first.value;
  return {
    ok: true,
    absolutePath: only,
    path: relative(realRoot, only).split(sep).join(POSIX_SEPARATOR),
  };
}
