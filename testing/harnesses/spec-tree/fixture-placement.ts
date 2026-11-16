/**
 * Observation of where a product's test files take their fixture support from: every module
 * inside the spec tree that a test file imports through a relative specifier and that is not
 * itself a test file, with the test files that import it.
 *
 * @module harnesses/spec-tree/fixture-placement
 */

import { readdir, readFile } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";

import ts from "typescript";

import { SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";

/** A node-local support module more than one test file imports, beside those importers in ascending order. */
export type ReusedNodeLocalSupportFile = {
  readonly supportPath: string;
  readonly importers: readonly string[];
};

const TYPESCRIPT_TEST_FILE_TAIL = `${SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR}${
  SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT.join(SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR)
}`;
const TYPESCRIPT_MODULE_EXTENSION = ".ts";
const RELATIVE_SPECIFIER_PREFIXES = ["./", "../"] as const;
const REUSED_IMPORTER_MINIMUM = 2;

/**
 * Every module under `productDir`'s spec tree that is not a TypeScript test file and that two or
 * more TypeScript test files of the spec tree import through a relative specifier, sorted by
 * product-relative path. Paths are product-relative and `/`-separated; an extensionless specifier
 * names the `.ts` module beside it. It returns the observation only; the linked test decides which
 * support placements are allowed.
 */
export async function findReusedNodeLocalSupportFiles(
  productDir: string,
): Promise<readonly ReusedNodeLocalSupportFile[]> {
  const specTreeDir = join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY);
  const entries = await readdir(specTreeDir, { recursive: true, withFileTypes: true });
  const testFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(TYPESCRIPT_TEST_FILE_TAIL))
    .map((entry) => productRelativePath(productDir, join(entry.parentPath, entry.name)));
  const importersBySupport = new Map<string, Set<string>>();
  const specTreePrefix = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;

  for (const testFile of testFiles) {
    const text = await readFile(join(productDir, testFile), "utf8");
    for (const { fileName: specifier } of ts.preProcessFile(text, true, true).importedFiles) {
      if (!RELATIVE_SPECIFIER_PREFIXES.some((prefix) => specifier.startsWith(prefix))) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(testFile), specifier));
      const supportPath = resolved.endsWith(TYPESCRIPT_MODULE_EXTENSION)
        ? resolved
        : `${resolved}${TYPESCRIPT_MODULE_EXTENSION}`;
      if (!supportPath.startsWith(specTreePrefix) || supportPath.endsWith(TYPESCRIPT_TEST_FILE_TAIL)) continue;
      const importers = importersBySupport.get(supportPath) ?? new Set<string>();
      importers.add(testFile);
      importersBySupport.set(supportPath, importers);
    }
  }

  return [...importersBySupport.entries()]
    .filter(([, importers]) => importers.size >= REUSED_IMPORTER_MINIMUM)
    .map(([supportPath, importers]) => ({ supportPath, importers: [...importers].sort(compareAsciiStrings) }))
    .sort((left, right) => compareAsciiStrings(left.supportPath, right.supportPath));
}

function productRelativePath(productDir: string, absolutePath: string): string {
  return relative(productDir, absolutePath).split(sep).join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
}
