/**
 * Generators for the temp-directory substrate: entry names, leftover entries a killed run left
 * behind, product-relative paths, and interleavings of directory requests and releases.
 *
 * Every generator is a pure function over a domain of names or operations. Source-owned prefixes come
 * from the temp-directory library, and each leftover or foreign name is built from them by
 * construction, never by filtering candidates through the production acceptance rule.
 *
 * @module testing/generators/temp-directory/temp-directory
 */

import * as fc from "fast-check";

import { TEMP_DIRECTORY_PATH } from "@/lib/temp-directory";

const ENTRY_NAME_PATTERN = /^[a-z][a-z0-9]{2,9}$/;
const LEFTOVER_ENTRY_MAX_COUNT = 4;
const PRODUCT_SEGMENT_MAX_COUNT = 2;
const OPERATION_MAX_COUNT = 12;
const RELEASE_PICK_MAX = 1_000;

/** Operation kinds a request and release interleaving draws from. */
export const TEMP_DIRECTORY_OPERATION = {
  CREATE: "create",
  CREATE_SCRATCH: "create-scratch",
  RELEASE: "release",
} as const;

export type TempDirectoryOperation =
  | { readonly kind: typeof TEMP_DIRECTORY_OPERATION.CREATE }
  | {
    readonly kind: typeof TEMP_DIRECTORY_OPERATION.CREATE_SCRATCH;
    readonly productSegments: readonly string[];
  }
  | {
    readonly kind: typeof TEMP_DIRECTORY_OPERATION.RELEASE;
    /** Selects, modulo the live count, which live directory the release targets. */
    readonly pick: number;
  };

/** A single directory-entry name: a safe path segment that contains no separator or hyphen. */
export function arbitraryEntryName(): fc.Arbitrary<string> {
  return fc.stringMatching(ENTRY_NAME_PATTERN);
}

/**
 * Names of directories an earlier run left in a worktree's run-root directory: some carry the run-root
 * prefix and some do not, because the start-of-run removal covers every directory there.
 */
export function arbitraryLeftoverRunRootNames(): fc.Arbitrary<string[]> {
  return fc.uniqueArray(
    fc.oneof(
      arbitraryEntryName(),
      arbitraryEntryName().map((name) => `${TEMP_DIRECTORY_PATH.RUN_ROOT_PREFIX}${name}`),
    ),
    { minLength: 1, maxLength: LEFTOVER_ENTRY_MAX_COUNT },
  );
}

/** Names of scratch directories an earlier run left in a scratch parent: each leads with the scratch prefix. */
export function arbitraryLeftoverScratchNames(): fc.Arbitrary<string[]> {
  return fc.uniqueArray(
    arbitraryEntryName().map((name) => `${TEMP_DIRECTORY_PATH.SCRATCH_PREFIX}${name}`),
    { minLength: 1, maxLength: LEFTOVER_ENTRY_MAX_COUNT },
  );
}

/**
 * Names of entries in a scratch parent that belong to other tools: each carries the scratch prefix
 * only after a leading name, so none leads with it by construction.
 */
export function arbitraryForeignScratchNames(): fc.Arbitrary<string[]> {
  return fc.uniqueArray(
    arbitraryEntryName().map((name) => `${name}${TEMP_DIRECTORY_PATH.SCRATCH_PREFIX}`),
    { minLength: 1, maxLength: LEFTOVER_ENTRY_MAX_COUNT },
  );
}

/** A product directory's path below its worktree root, as path segments. */
export function arbitraryProductSegments(): fc.Arbitrary<string[]> {
  return fc.array(arbitraryEntryName(), { minLength: 1, maxLength: PRODUCT_SEGMENT_MAX_COUNT });
}

/** An interleaving of directory requests and releases within one run. */
export function arbitraryTempDirectoryOperations(): fc.Arbitrary<TempDirectoryOperation[]> {
  return fc.array(
    fc.oneof(
      fc.constant<TempDirectoryOperation>({ kind: TEMP_DIRECTORY_OPERATION.CREATE }),
      arbitraryProductSegments().map<TempDirectoryOperation>((productSegments) => ({
        kind: TEMP_DIRECTORY_OPERATION.CREATE_SCRATCH,
        productSegments,
      })),
      fc.nat(RELEASE_PICK_MAX).map<TempDirectoryOperation>((pick) => ({
        kind: TEMP_DIRECTORY_OPERATION.RELEASE,
        pick,
      })),
    ),
    { minLength: 1, maxLength: OPERATION_MAX_COUNT },
  );
}
