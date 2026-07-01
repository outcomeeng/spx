import { join } from "node:path";

import { digestDescriptorSection } from "@/config/descriptor-digest";
import type { Result } from "@/config/types";
import { branchScopeDir, runsDir, validateScopeToken } from "@/lib/state-store";

export const VERIFY_SCOPE_TYPE = {
  CHANGESET: "changeset",
  WORKING_TREE: "working-tree",
} as const;

export type VerifyScopeType = (typeof VERIFY_SCOPE_TYPE)[keyof typeof VERIFY_SCOPE_TYPE];

export const VERIFY_VERB = {
  START: "start",
  INPUT: "input",
} as const;

export type VerifyVerb = (typeof VERIFY_VERB)[keyof typeof VERIFY_VERB];

export const VERIFY_INPUT_SOURCE = {
  STDIN: "stdin",
} as const;

export type VerifyInputSource = (typeof VERIFY_INPUT_SOURCE)[keyof typeof VERIFY_INPUT_SOURCE];

export const VERIFY_SCOPE_SEPARATOR = "..";

export const VERIFY_SCOPE_ERROR = {
  MALFORMED_CHANGESET: "verify changeset scope must be <base>..<head>",
  UNSUPPORTED_SCOPE_TYPE: "verify scope type has no verification-context substrate representation",
} as const;

/** The digest-path label the recorded run input is canonicalized under before hashing. */
export const VERIFY_INPUT_DIGEST_PATH = "verify run input";

export interface ChangesetScope {
  readonly base: string;
  readonly head: string;
}

/**
 * Split a `<base>..<head>` changeset scope operand into its two refs. A missing separator,
 * an empty ref, or a second separator is malformed and rejected before the command resolves
 * a subject, so a caller cannot open a run over an unrepresentable scope.
 */
export function parseChangesetScope(scope: string): Result<ChangesetScope> {
  const separatorIndex = scope.indexOf(VERIFY_SCOPE_SEPARATOR);
  if (separatorIndex < 0) return { ok: false, error: VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET };
  const base = scope.slice(0, separatorIndex);
  const head = scope.slice(separatorIndex + VERIFY_SCOPE_SEPARATOR.length);
  if (base.length === 0 || head.length === 0 || head.includes(VERIFY_SCOPE_SEPARATOR)) {
    return { ok: false, error: VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET };
  }
  return { ok: true, value: { base, head } };
}

/**
 * A run locator names every resolved selector a caller persists to address the run later:
 * the run token plus the verification type, scope type, scope identity, backend identity,
 * storage namespace, and the journal run path or backend target the run persists to.
 */
export interface RunLocator {
  readonly runToken: string;
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scopeIdentity: string;
  readonly backendIdentity: string;
  readonly storageNamespace: string;
  readonly runTarget: string;
}

/** Assemble a run locator from the resolved selectors and run target. */
export function buildRunLocator(parts: RunLocator): RunLocator {
  return {
    runToken: parts.runToken,
    verificationType: parts.verificationType,
    scopeType: parts.scopeType,
    scopeIdentity: parts.scopeIdentity,
    backendIdentity: parts.backendIdentity,
    storageNamespace: parts.storageNamespace,
    runTarget: parts.runTarget,
  };
}

/**
 * A recorded verification input's replayable descriptor: the source the input was read from
 * and the canonical digest recorded at start, so the `input` verb replays the exact input.
 */
export interface InputDescriptor {
  readonly source: string;
  readonly digest: string;
}

/**
 * Digest a recorded run input canonically over its source and content, so the same input
 * yields the same descriptor digest for replay verification independent of the run token.
 */
export function digestRunInput(source: string, content: string): Result<string> {
  const digest = digestDescriptorSection({ source, content }, VERIFY_INPUT_DIGEST_PATH);
  if (!digest.ok) return digest;
  return { ok: true, value: digest.value.sha256 };
}

/** The filename affixes for a run's persisted input record, a sibling of its run journal. */
export const VERIFY_INPUT_RECORD = {
  PREFIX: "input-",
  SUFFIX: ".json",
} as const;

/** The scope that addresses one run's persisted artifacts under the state store. */
export interface VerifyRunScope {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly type: string;
  readonly runToken: string;
}

/** A recorded run input persisted at start and replayed by the `input` verb. */
export interface RecordedInput {
  readonly source: string;
  readonly digest: string;
  readonly content: string;
}

/**
 * The run's storage namespace — the state-store runs directory
 * `.spx/branch/<branch-slug>/<type>/runs` its journal and input record persist under.
 */
export function verifyRunsDir(scope: Omit<VerifyRunScope, "runToken">): Result<string> {
  const branchScope = branchScopeDir(scope.productDir, scope.branchSlug);
  if (!branchScope.ok) return branchScope;
  return runsDir(branchScope.value, scope.type);
}

/**
 * The run's input-record path, a validated sibling of its run journal in the runs directory.
 * The run token is validated for path safety, so a caller-supplied token cannot escape the
 * runs directory.
 */
export function verifyInputRecordPath(scope: VerifyRunScope): Result<string> {
  const runs = verifyRunsDir(scope);
  if (!runs.ok) return runs;
  const token = validateScopeToken(scope.runToken);
  if (!token.ok) return token;
  return {
    ok: true,
    value: join(runs.value, `${VERIFY_INPUT_RECORD.PREFIX}${token.value}${VERIFY_INPUT_RECORD.SUFFIX}`),
  };
}
