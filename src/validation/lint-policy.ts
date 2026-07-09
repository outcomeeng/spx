import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { withoutGitEnvironment } from "@/lib/git/environment";
import { SPEC_TREE_SUPERSEDED_NODE_SUFFIXES } from "@/lib/spec-tree";
import { NODE_SUFFIXES, SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { LINT_POLICY_BASE_REFS, LINT_POLICY_MANIFESTS, parseLintPolicyManifest } from "./lint-policy-constants";

const TEST_LINT_DEBT_NODE_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.file;
const TEST_LINT_DEBT_NODE_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.key;
const TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_OWNED_CONSTANT_DEBT_NODES.file;
const TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_OWNED_CONSTANT_DEBT_NODES.key;
const SPEC_TREE_ROOT = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const BASE_BRANCH_REFS = [LINT_POLICY_BASE_REFS.REMOTE_MAIN, LINT_POLICY_BASE_REFS.LOCAL_MAIN] as const;

function isSpecTreeNodePath(entry: string): boolean {
  return NODE_SUFFIXES.some((suffix) => entry.endsWith(suffix));
}

export type LintPolicyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

function readManifest(productDir: string, file: string, key: string): string[] {
  return parseLintPolicyManifest(
    readFileSync(join(productDir, file), "utf-8"),
    file,
    key,
  );
}

function manifestExists(productDir: string, file: string): boolean {
  return existsSync(join(productDir, file));
}

function findDeprecatedSpecNodePath(productDir: string): string | undefined {
  function visit(relativeDirectory: string): string | undefined {
    const absoluteDirectory = join(productDir, relativeDirectory);
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const childPath = `${relativeDirectory}/${entry.name}`;

      if (SPEC_TREE_SUPERSEDED_NODE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
        return childPath;
      }

      const nestedDeprecatedPath = visit(childPath);
      if (nestedDeprecatedPath !== undefined) {
        return nestedDeprecatedPath;
      }
    }

    return undefined;
  }

  const specTreeRootPath = join(productDir, SPEC_TREE_ROOT);
  if (!existsSync(specTreeRootPath)) {
    return undefined;
  }

  return visit(SPEC_TREE_ROOT);
}

function assertManifestEntries(
  productDir: string,
  file: string,
  entries: string[],
  suffixPredicate: (entry: string) => boolean,
  suffixDescription: string,
): void {
  const duplicates = entries.filter((entry, index) => entries.indexOf(entry) !== index);

  if (duplicates.length > 0) {
    throw new Error(
      `${file} contains duplicate entries: ${duplicates.join(", ")}`,
    );
  }

  for (const entry of entries) {
    if (entry !== entry.trim()) {
      throw new Error(`${file} entry has surrounding whitespace: ${entry}`);
    }

    if (!entry.startsWith(`${SPEC_TREE_ROOT}/`)) {
      throw new Error(`${file} entry must be under ${SPEC_TREE_ROOT}/: ${entry}`);
    }

    if (entry.includes("..")) {
      throw new Error(`${file} entry must not contain '..': ${entry}`);
    }

    if (!suffixPredicate(entry)) {
      throw new Error(`${file} entry must ${suffixDescription}: ${entry}`);
    }

    const absoluteEntry = join(productDir, entry);
    if (!existsSync(absoluteEntry) || !statSync(absoluteEntry).isDirectory()) {
      throw new Error(`${file} entry does not exist as a directory: ${entry}`);
    }
  }
}

function readBaselineManifest(productDir: string, file: string, key: string): string[] | undefined {
  const baselineRef = readBaselineRef(productDir);
  if (baselineRef === undefined) {
    return undefined;
  }

  let content: string;
  try {
    content = execFileSync("git", ["show", `${baselineRef}:${file}`], {
      cwd: productDir,
      encoding: "utf-8",
      env: withoutGitEnvironment(process.env),
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }

  return parseLintPolicyManifest(
    content,
    `${baselineRef}:${file}`,
    key,
  );
}

function readBaselineRef(productDir: string): string | undefined {
  const mergeCommitFirstParent = readMergeCommitFirstParent(productDir);
  if (mergeCommitFirstParent !== undefined) {
    return mergeCommitFirstParent;
  }

  for (const baseBranchRef of BASE_BRANCH_REFS) {
    const mergeBase = readMergeBase(productDir, baseBranchRef);
    if (mergeBase !== undefined) {
      return mergeBase;
    }
  }

  return undefined;
}

function readMergeCommitFirstParent(productDir: string): string | undefined {
  const secondParent = readGitRef(productDir, ["rev-parse", "--verify", "HEAD^2"]);
  if (secondParent === undefined) {
    return undefined;
  }
  return readGitRef(productDir, ["rev-parse", "--verify", "HEAD^1"]);
}

function readMergeBase(productDir: string, baseBranchRef: string): string | undefined {
  return readGitRef(productDir, ["merge-base", "HEAD", baseBranchRef]);
}

function readGitRef(productDir: string, args: readonly string[]): string | undefined {
  try {
    const output = execFileSync("git", [...args], {
      cwd: productDir,
      encoding: "utf-8",
      env: withoutGitEnvironment(process.env),
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim() || undefined;
  } catch {
    return undefined;
  }
}

function assertManifestDoesNotGrow(
  productDir: string,
  file: string,
  key: string,
  entries: string[],
): void {
  const baselineEntries = readBaselineManifest(productDir, file, key);

  if (baselineEntries === undefined) {
    return;
  }

  const baselineEntrySet = new Set(baselineEntries);
  const additions = entries.filter((entry) => !baselineEntrySet.has(entry));

  if (additions.length > 0) {
    throw new Error(
      `${file} is shrink-only. Remove the listed debt instead of adding entries: ${additions.join(", ")}`,
    );
  }
}

function rejectDeprecatedSpecNodeSuffixes(productDir: string): void {
  const deprecatedSpecNodePath = findDeprecatedSpecNodePath(productDir);
  if (deprecatedSpecNodePath !== undefined) {
    throw new Error(
      `Spec Tree nodes must use current suffixes only: ${deprecatedSpecNodePath}`,
    );
  }
}

function validateTestLintDebtNodeManifest(productDir: string, entries: string[]): void {
  assertManifestEntries(
    productDir,
    TEST_LINT_DEBT_NODE_MANIFEST_FILE,
    entries,
    isSpecTreeNodePath,
    "be a Spec Tree node path",
  );
  assertManifestDoesNotGrow(
    productDir,
    TEST_LINT_DEBT_NODE_MANIFEST_FILE,
    TEST_LINT_DEBT_NODE_MANIFEST_KEY,
    entries,
  );
}

function validateTestOwnedConstantDebtNodeManifest(productDir: string, entries: string[]): void {
  assertManifestEntries(
    productDir,
    TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_FILE,
    entries,
    isSpecTreeNodePath,
    "be a Spec Tree node path",
  );
  assertManifestDoesNotGrow(
    productDir,
    TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_FILE,
    TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_KEY,
    entries,
  );
}

export function validateLintPolicy(productDir: string): LintPolicyResult {
  try {
    rejectDeprecatedSpecNodeSuffixes(productDir);

    const manifestExistence = [
      manifestExists(productDir, TEST_LINT_DEBT_NODE_MANIFEST_FILE),
      manifestExists(productDir, TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_FILE),
    ];
    if (manifestExistence.every((exists) => !exists)) {
      return { ok: true };
    }
    if (!manifestExistence.every(Boolean)) {
      return {
        ok: false,
        error: "lint policy manifests must be present together",
      };
    }

    validateTestLintDebtNodeManifest(
      productDir,
      readManifest(productDir, TEST_LINT_DEBT_NODE_MANIFEST_FILE, TEST_LINT_DEBT_NODE_MANIFEST_KEY),
    );
    validateTestOwnedConstantDebtNodeManifest(
      productDir,
      readManifest(
        productDir,
        TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_FILE,
        TEST_OWNED_CONSTANT_DEBT_NODE_MANIFEST_KEY,
      ),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
