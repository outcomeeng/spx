/**
 * Generators for the handoff-base gate's value domain: the git facts the gate
 * decides over ({@link HandoffGitFacts}) and the refusal checklist it carries
 * ({@link HandoffBaseChecklist}). These are pure value structs — the resolver
 * and formatter verify in isolation over generated instances rather than
 * hand-picked fixtures.
 *
 * @module session/testing/handoff-base
 */

import * as fc from "fast-check";

import type { HandoffGitFacts } from "@/domains/session/handoff-base";
import {
  HANDOFF_BASE_PREREQUISITE_LABEL,
  HANDOFF_BASE_REMEDY,
  type HandoffBaseChecklist,
  type HandoffBasePrerequisite,
} from "@/domains/session/handoff-base-checklist";

const PREREQUISITE_LABELS = Object.values(HANDOFF_BASE_PREREQUISITE_LABEL);
const REMEDIES = Object.values(HANDOFF_BASE_REMEDY);
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const PATH_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{2,12}$/;
const POSIX_SEPARATOR = "/";
const MAX_PATH_SEGMENTS = 4;
const MAX_PREREQUISITES = 4;

/** A 40-character lowercase hex commit SHA. */
export function arbitraryCommitSha(): fc.Arbitrary<string> {
  return fc.stringMatching(COMMIT_SHA_PATTERN);
}

/** A single lowercase path segment. */
function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(PATH_SEGMENT_PATTERN);
}

/** An absolute POSIX path with one or more segments. */
export function arbitraryAbsolutePath(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryPathSegment(), { minLength: 1, maxLength: MAX_PATH_SEGMENTS })
    .map((segments) => `${POSIX_SEPARATOR}${segments.join(POSIX_SEPARATOR)}`);
}

/** A git branch name. */
export function arbitraryBranchName(): fc.Arbitrary<string> {
  return arbitraryPathSegment();
}

/**
 * One base prerequisite. A met prerequisite carries no remedy; an unmet one
 * carries a remedy drawn from {@link HANDOFF_BASE_REMEDY}. Both forms are
 * generated so the formatter is exercised over met and unmet lines.
 */
export function arbitraryHandoffBasePrerequisite(): fc.Arbitrary<HandoffBasePrerequisite> {
  return fc
    .record({
      label: fc.constantFrom(...PREREQUISITE_LABELS),
      met: fc.boolean(),
      remedy: fc.constantFrom(...REMEDIES),
    })
    .map(({ label, met, remedy }) => ({ label, met, remedy: met ? "" : remedy }));
}

/**
 * A refusal checklist over the full value domain: each nullable fact resolves or
 * does not (`null`), and the prerequisite list ranges over the empty and
 * populated cases. The renderer is total over this domain.
 */
export function arbitraryHandoffBaseChecklist(): fc.Arbitrary<HandoffBaseChecklist> {
  return fc.record({
    defaultBranch: fc.option(arbitraryBranchName(), { nil: null }),
    defaultTipSha: fc.option(arbitraryCommitSha(), { nil: null }),
    headSha: fc.option(arbitraryCommitSha(), { nil: null }),
    currentWorktreePath: arbitraryAbsolutePath(),
    mainCheckoutPath: fc.option(arbitraryAbsolutePath(), { nil: null }),
    prerequisites: fc.array(arbitraryHandoffBasePrerequisite(), { maxLength: MAX_PREREQUISITES }),
  });
}

/**
 * Git facts over the gate's decision domain. Every field ranges independently so
 * the resolver's branches — non-git, main checkout (on a branch / detached /
 * no HEAD), and non-main checkout (clean/dirty × at-tip/off-tip × resolved/unresolved
 * tip) — are all reachable from the generated space.
 */
export function arbitraryHandoffGitFacts(): fc.Arbitrary<HandoffGitFacts> {
  return fc.record({
    isGitRepo: fc.boolean(),
    isMainCheckout: fc.boolean(),
    branch: fc.option(arbitraryBranchName(), { nil: null }),
    headSha: fc.option(arbitraryCommitSha(), { nil: null }),
    isClean: fc.boolean(),
    defaultBranch: fc.option(arbitraryBranchName(), { nil: null }),
    defaultTipSha: fc.option(arbitraryCommitSha(), { nil: null }),
    currentWorktreePath: arbitraryAbsolutePath(),
    mainCheckoutPath: fc.option(arbitraryAbsolutePath(), { nil: null }),
  });
}
