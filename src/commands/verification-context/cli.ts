import { isAbsolute, win32 } from "node:path";

import type { CliCommandResult } from "@/config/types";
import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";
import {
  createVerificationContextDocument,
  VERIFICATION_CONTEXT_PERSISTENCE,
  VERIFICATION_CONTEXT_SCHEMA_VERSION,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
  type VerificationContextSubject,
} from "@/domains/verification-context/context";
import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  getCurrentBranch,
  getHeadSha,
  type GitDependencies,
} from "@/lib/git/root";
import { resolveBranchIdentity, slugBranchIdentity, type StateStoreFileSystem } from "@/lib/state-store";
import { SPX_VERIFY_ENV, SPX_VERIFY_HEAD_SHA } from "@/lib/verification-env";

import { persistVerificationContext } from "./runtime";

export const VERIFICATION_CONTEXT_CLI_EXIT_CODE = {
  OK: 0,
  ERROR: 1,
} as const;

export const VERIFICATION_CONTEXT_CLI_ENV = {
  BRANCH: SPX_VERIFY_ENV.BRANCH,
} as const;

export const VERIFICATION_CONTEXT_CLI_ERROR = {
  INVALID_SUBJECT: "verification context subject must be file or changeset",
  FILE_PATH_REQUIRED: "verification context file subject requires --path",
  FILE_PATH_UNSAFE: "verification context file subject path must be product-relative",
  CHANGESET_REFS_REQUIRED: "verification context changeset subject requires --base and --head",
} as const;

export const VERIFICATION_CONTEXT_FILE_SUBJECT_PATH = {
  PARENT_DIRECTORY: {
    SEGMENT: "..",
    PREFIX: "../",
  },
  SEPARATOR: {
    CANONICAL: "/",
    WINDOWS: "\\",
  },
} as const;

export interface VerificationContextCliDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly branch?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
}

export interface VerificationContextCreateCliOptions {
  readonly subject: string;
  readonly path?: string;
  readonly base?: string;
  readonly head?: string;
  readonly predicate: string;
  readonly workflow: string;
}

interface VerificationContextCommandScope {
  readonly storageProductDir: string;
  readonly launchProductDir: string;
  readonly branchSlug: string;
  readonly branchIdentity: string;
  readonly headSha: string;
}

async function resolveCommandScope(deps: VerificationContextCliDeps): Promise<VerificationContextCommandScope> {
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const git = deps.git ?? defaultGitDependencies;
  const product = await detectGitCommonDirProductRoot(cwd, git);
  const processEnv = deps.processEnv ?? process.env;
  const probedBranch = product.isGitRepo ? (await getCurrentBranch(cwd, git)) ?? undefined : undefined;
  const headSha = (product.isGitRepo ? await getHeadSha(cwd, git) : null) ?? SPX_VERIFY_HEAD_SHA.MISSING;
  const branchIdentity = resolveBranchIdentity({
    branchName: deps.branch ?? processEnv[VERIFICATION_CONTEXT_CLI_ENV.BRANCH] ?? probedBranch,
    headSha,
  });
  return {
    storageProductDir: product.productDir,
    launchProductDir: product.worktreeRoot,
    branchSlug: slugBranchIdentity(branchIdentity),
    branchIdentity,
    headSha,
  };
}

function okResult(output: string): CliCommandResult {
  return { exitCode: VERIFICATION_CONTEXT_CLI_EXIT_CODE.OK, output };
}

function errorResult(error: string): CliCommandResult {
  return { exitCode: VERIFICATION_CONTEXT_CLI_EXIT_CODE.ERROR, output: error };
}

function normalizeFileSubjectPath(path: string): string | undefined {
  const windowsRoot = win32.parse(path).root;
  const normalized = win32
    .normalize(path)
    .replaceAll(
      VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.WINDOWS,
      VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL,
    );
  const segments = normalized.split(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.SEPARATOR.CANONICAL);
  if (
    isAbsolute(path)
    || win32.isAbsolute(path)
    || windowsRoot.length > 0
    || segments.includes(VERIFICATION_CONTEXT_FILE_SUBJECT_PATH.PARENT_DIRECTORY.SEGMENT)
  ) {
    return undefined;
  }
  return normalized;
}

function resolveSubject(options: VerificationContextCreateCliOptions): VerificationContextSubject | string {
  if (options.subject === VERIFICATION_CONTEXT_SUBJECT_KIND.FILE) {
    if (options.path === undefined || options.path.length === 0) {
      return VERIFICATION_CONTEXT_CLI_ERROR.FILE_PATH_REQUIRED;
    }
    const path = normalizeFileSubjectPath(options.path);
    if (path === undefined) return VERIFICATION_CONTEXT_CLI_ERROR.FILE_PATH_UNSAFE;
    return { kind: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE, path };
  }
  if (options.subject === VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET) {
    if (
      options.base === undefined
      || options.base.length === 0
      || options.head === undefined
      || options.head.length === 0
    ) {
      return VERIFICATION_CONTEXT_CLI_ERROR.CHANGESET_REFS_REQUIRED;
    }
    return { kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET, base: options.base, head: options.head };
  }
  return VERIFICATION_CONTEXT_CLI_ERROR.INVALID_SUBJECT;
}

export async function verificationContextCreateCommand(
  options: VerificationContextCreateCliOptions,
  deps: VerificationContextCliDeps = {},
): Promise<CliCommandResult> {
  const subject = resolveSubject(options);
  if (typeof subject === "string") return errorResult(subject);
  const scope = await resolveCommandScope(deps);
  const document = createVerificationContextDocument({
    schemaVersion: VERIFICATION_CONTEXT_SCHEMA_VERSION,
    subject,
    predicate: options.predicate,
    workflow: { name: options.workflow },
    launch: {
      productDir: scope.launchProductDir,
      branchSlug: scope.branchSlug,
      branchIdentity: scope.branchIdentity,
      headSha: scope.headSha,
      createdAt: (deps.now ?? (() => new Date()))().toISOString(),
    },
    persistence: VERIFICATION_CONTEXT_PERSISTENCE,
  });
  if (!document.ok) return errorResult(document.error);
  const persisted = await persistVerificationContext(
    { productDir: scope.storageProductDir, branchSlug: scope.branchSlug, digest: document.value.digest },
    document.value,
    { ...(deps.fs === undefined ? {} : { fs: deps.fs }) },
  );
  if (!persisted.ok) return errorResult(persisted.error);
  return okResult(JSON.stringify(persisted.value));
}
