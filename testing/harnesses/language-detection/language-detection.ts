/**
 * Language-detection harness.
 *
 * Supplies the three boundaries language-detection evidence crosses:
 *
 * - inert fixture products resolved by path, whose whole file layout is the case;
 * - a real temporary product directory holding the requested marker files;
 * - a controlled file-presence view over a generated set of existing paths, used by
 *   property evidence where a real temporary directory per generated case would make
 *   broad evidence prohibitively expensive (combinatorial-cost exception). The view
 *   preserves the `LanguageDetectionDeps` boundary and answers presence only.
 *
 * Every function returns handles or observations; none decides a verdict.
 *
 * @module testing/harnesses/language-detection/language-detection
 */

import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { LanguageDetectionDeps } from "@/validation/discovery/language-finder";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const FIXTURES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../fixtures");
const MARKER_PRODUCT_TEMP_PREFIX = "spx-language-detection-";
const EMPTY_MARKER_CONTENT = "";

/** Fixture products whose source files carry one language's extension while its marker is absent. */
export const LANGUAGE_DETECTION_FIXTURES = {
  PYTHON_WITH_VENDORED_TYPESCRIPT: "projects/python-with-vendored-typescript",
  TYPESCRIPT_WITH_VENDORED_PYTHON: "projects/typescript-with-vendored-python",
} as const;

export type LanguageDetectionFixture = (typeof LANGUAGE_DETECTION_FIXTURES)[keyof typeof LANGUAGE_DETECTION_FIXTURES];

/** Absolute path of an inert fixture product, passed as the product root. */
export function languageDetectionFixturePath(fixture: LanguageDetectionFixture): string {
  return join(FIXTURES_ROOT, fixture);
}

/**
 * Runs the callback against a fresh temporary product directory that holds exactly the
 * given marker files at its root, and removes the directory afterwards.
 */
export function withLanguageMarkerProduct<T>(
  markerFileNames: readonly string[],
  callback: (productDir: string) => Promise<T> | T,
): Promise<T> {
  return withTempDir(MARKER_PRODUCT_TEMP_PREFIX, async (productDir) => {
    await Promise.all(
      markerFileNames.map((markerFileName) => writeFile(join(productDir, markerFileName), EMPTY_MARKER_CONTENT)),
    );
    return callback(productDir);
  });
}

/** A file-presence view that reports exactly the given absolute paths as existing. */
export function createControlledFilePresence(existingPaths: Iterable<string>): LanguageDetectionDeps {
  const present = new Set(existingPaths);
  return {
    existsSync: (filePath: string) => present.has(filePath),
  };
}
