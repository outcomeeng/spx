/**
 * Generators for language-detection inputs.
 *
 * A generated file view is one product root plus the set of paths that exist around it:
 * any subset of the source-owned marker and ESLint config names at the root, unrelated
 * root files, and marker names placed in nested directories. Related values agree — every
 * existing path is composed from the same product root.
 *
 * @module testing/generators/language-detection/language-detection
 */

import { join } from "node:path";

import * as fc from "fast-check";

import {
  ESLINT_CONFIG_FILES,
  ESLINT_PRODUCTION_CONFIG_FILES,
  PYTHON_MARKER,
  TYPESCRIPT_MARKER,
} from "@/validation/discovery/language-finder";
import { arbitraryPathSegment } from "@testing/generators/git-name/git-name";

const DETECTION_FILE_NAMES = [
  TYPESCRIPT_MARKER,
  PYTHON_MARKER,
  ...ESLINT_CONFIG_FILES,
  ...ESLINT_PRODUCTION_CONFIG_FILES,
] as const;

const UNRELATED_FILE_NAME_PATTERN = /^[a-z][a-z0-9-]{0,10}\.(?:md|txt|lock)$/;
const MAX_UNRELATED_FILES = 4;
const MAX_NESTED_MARKERS = 3;
const MAX_ROOT_SEGMENTS = 4;
const FILESYSTEM_ROOT = "/";

export interface LanguageDetectionFileView {
  /** Product root passed to detection. */
  readonly productDir: string;
  /** Detection-relevant file names that exist directly at the product root. */
  readonly rootFileNames: readonly string[];
  /** Every existing absolute path, root files and nested decoys alike. */
  readonly existingPaths: readonly string[];
}

function arbitraryProductDir(): fc.Arbitrary<string> {
  return fc
    .array(arbitraryPathSegment(), { minLength: 1, maxLength: MAX_ROOT_SEGMENTS })
    .map((segments) => join(FILESYSTEM_ROOT, ...segments));
}

function arbitraryNestedMarkerPath(productDir: string): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: MAX_NESTED_MARKERS }),
      fc.constantFrom(TYPESCRIPT_MARKER, PYTHON_MARKER),
    )
    .map(([segments, marker]) => join(productDir, ...segments, marker));
}

/** A product root with a generated set of existing root files and nested decoy markers. */
export function arbitraryLanguageDetectionFileView(): fc.Arbitrary<LanguageDetectionFileView> {
  return arbitraryProductDir().chain((productDir) =>
    fc
      .record({
        rootFileNames: fc.subarray([...DETECTION_FILE_NAMES]),
        unrelatedFileNames: fc.uniqueArray(fc.stringMatching(UNRELATED_FILE_NAME_PATTERN), {
          maxLength: MAX_UNRELATED_FILES,
        }),
        nestedMarkerPaths: fc.array(arbitraryNestedMarkerPath(productDir), { maxLength: MAX_NESTED_MARKERS }),
      })
      .map(({ rootFileNames, unrelatedFileNames, nestedMarkerPaths }) => ({
        productDir,
        rootFileNames,
        existingPaths: [
          ...rootFileNames.map((fileName) => join(productDir, fileName)),
          ...unrelatedFileNames.map((fileName) => join(productDir, fileName)),
          ...nestedMarkerPaths,
        ],
      }))
  );
}
