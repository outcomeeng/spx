/**
 * Generated domains for session-reconciliation evidence: branch names, entry
 * paths, and positionally consistent metadata-plus-probe scenarios.
 *
 * @module testing/generators/session/reconcile
 */

import fc from "fast-check";

import {
  ENTRY_PROBE_OUTCOME,
  type EntryProbeOutcome,
  GIT_REF_PROBE_OUTCOME,
  type GitRefProbeOutcome,
  type ReconcileProbes,
} from "@/domains/session/reconcile";
import { DEFAULT_PRIORITY, type SessionMetadata } from "@/domains/session/types";

const BRANCH_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789-";
const PATH_SEGMENT_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789-";
const MAX_BRANCH_LENGTH = 24;
const MAX_PATH_SEGMENT_LENGTH = 10;
const MAX_PATH_SEGMENTS = 3;
const MAX_ENTRIES_PER_ARRAY = 4;

/** A git-safe branch name: lowercase alphanumerics and hyphens, no leading or trailing hyphen. */
export function arbitraryReconcileBranchName(): fc.Arbitrary<string> {
  return fc
    .string({ unit: fc.constantFrom(...BRANCH_ALPHABET), minLength: 1, maxLength: MAX_BRANCH_LENGTH })
    .filter((name) => !name.startsWith("-") && !name.endsWith("-"));
}

/** A relative entry path of one to three safe segments. */
export function arbitraryReconcileEntryPath(): fc.Arbitrary<string> {
  const segment = fc
    .string({ unit: fc.constantFrom(...PATH_SEGMENT_ALPHABET), minLength: 1, maxLength: MAX_PATH_SEGMENT_LENGTH })
    .filter((part) => !part.startsWith("-"));
  return fc
    .array(segment, { minLength: 1, maxLength: MAX_PATH_SEGMENTS })
    .map((segments) => segments.join("/"));
}

/**
 * `count` distinct relative entry paths, prefix-free so a generated file path
 * never collides with a generated directory path on a shared filesystem root.
 */
export function arbitraryDistinctReconcileEntryPaths(count: number): fc.Arbitrary<readonly string[]> {
  return fc
    .uniqueArray(arbitraryReconcileEntryPath(), { minLength: count, maxLength: count })
    .filter((paths) =>
      paths.every((path, index) =>
        paths.every(
          (other, otherIndex) =>
            index === otherIndex || (!path.startsWith(`${other}/`) && !other.startsWith(`${path}/`)),
        )
      )
    );
}

function arbitraryGitRefProbeOutcome(): fc.Arbitrary<GitRefProbeOutcome> {
  return fc.constantFrom(...Object.values(GIT_REF_PROBE_OUTCOME));
}

function arbitraryEntryProbeOutcome(): fc.Arbitrary<EntryProbeOutcome> {
  return fc.constantFrom(...Object.values(ENTRY_PROBE_OUTCOME));
}

/** One metadata record with positionally consistent probe outcomes for every recorded reference. */
export interface ReconcileTotalityScenario {
  readonly metadata: SessionMetadata;
  readonly probes: ReconcileProbes;
}

function arbitraryEntriesWithOutcomes(): fc.Arbitrary<{
  readonly paths: readonly string[];
  readonly outcomes: readonly EntryProbeOutcome[];
}> {
  return fc
    .array(fc.tuple(arbitraryReconcileEntryPath(), arbitraryEntryProbeOutcome()), {
      maxLength: MAX_ENTRIES_PER_ARRAY,
    })
    .map((pairs) => ({
      paths: pairs.map(([path]) => path),
      outcomes: pairs.map(([, outcome]) => outcome),
    }));
}

/**
 * A session metadata record — `git_ref` recorded or empty, `specs` and `files`
 * arrays of zero to four entries — paired with one probe outcome per recorded
 * reference, so totality can be judged over the whole reference-set domain.
 */
export function arbitraryReconcileTotalityScenario(): fc.Arbitrary<ReconcileTotalityScenario> {
  return fc
    .record({
      gitRef: fc.oneof(fc.constant(""), arbitraryReconcileBranchName()),
      gitRefOutcome: arbitraryGitRefProbeOutcome(),
      specs: arbitraryEntriesWithOutcomes(),
      files: arbitraryEntriesWithOutcomes(),
    })
    .map(({ gitRef, gitRefOutcome, specs, files }) => ({
      metadata: {
        priority: DEFAULT_PRIORITY,
        git_ref: gitRef,
        goal: "",
        next_step: "",
        specs: [...specs.paths],
        files: [...files.paths],
      },
      probes: {
        gitRef: gitRef === "" ? undefined : gitRefOutcome,
        specs: specs.outcomes,
        files: files.outcomes,
      },
    }));
}

/** A store-level scenario: a recorded branch plus entry arrays for a real session file. */
export interface ReconcileStoreScenario {
  readonly gitRef: string;
  readonly specs: readonly string[];
  readonly files: readonly string[];
}

/** A session record shape whose reconciliation runs against a real store. */
export function arbitraryReconcileStoreScenario(): fc.Arbitrary<ReconcileStoreScenario> {
  return fc.record({
    gitRef: arbitraryReconcileBranchName(),
    specs: fc.array(arbitraryReconcileEntryPath(), { maxLength: MAX_ENTRIES_PER_ARRAY }),
    files: fc.array(arbitraryReconcileEntryPath(), { maxLength: MAX_ENTRIES_PER_ARRAY }),
  });
}
