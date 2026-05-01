import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { LINT_POLICY_BASE_REFS, LINT_POLICY_MANIFESTS, parseLintPolicyManifest } from "./lint-policy-constants";

const LEGACY_SPEC_SUFFIX_NODE_MANIFEST_FILE = LINT_POLICY_MANIFESTS.LEGACY_SPEC_SUFFIX_NODES.file;
const LEGACY_SPEC_SUFFIX_NODE_MANIFEST_KEY = LINT_POLICY_MANIFESTS.LEGACY_SPEC_SUFFIX_NODES.key;
const TEST_LINT_DEBT_NODE_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.file;
const TEST_LINT_DEBT_NODE_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.key;
const SPEC_TREE_ROOT = "spx";
const SPEC_TREE_NODE_SUFFIX_PATTERN = /\.(enabler|outcome|capability|feature|story)$/;
const LEGACY_SPEC_NODE_SUFFIX_PATTERN = /\.(capability|feature|story)$/;
const BASE_BRANCH_REFS = [LINT_POLICY_BASE_REFS.REMOTE_MAIN, LINT_POLICY_BASE_REFS.LOCAL_MAIN] as const;

export type LintPolicyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

function readManifest(projectRoot: string, file: string, key: string): string[] {
  return parseLintPolicyManifest(
    readFileSync(join(projectRoot, file), "utf-8"),
    file,
    key,
  );
}

function manifestExists(projectRoot: string, file: string): boolean {
  return existsSync(join(projectRoot, file));
}

function listLegacySpecNodePaths(projectRoot: string): string[] {
  const legacySpecNodePaths: string[] = [];

  function visit(relativeDirectory: string): void {
    const absoluteDirectory = join(projectRoot, relativeDirectory);
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const childPath = `${relativeDirectory}/${entry.name}`;

      if (LEGACY_SPEC_NODE_SUFFIX_PATTERN.test(entry.name)) {
        legacySpecNodePaths.push(childPath);
      }

      visit(childPath);
    }
  }

  const specTreeRootPath = join(projectRoot, SPEC_TREE_ROOT);
  if (!existsSync(specTreeRootPath)) {
    return [];
  }

  visit(SPEC_TREE_ROOT);
  return legacySpecNodePaths.sort();
}

function assertManifestEntries(
  projectRoot: string,
  file: string,
  entries: string[],
  suffixPattern: RegExp,
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

    if (!suffixPattern.test(entry)) {
      throw new Error(`${file} entry must ${suffixDescription}: ${entry}`);
    }

    const absoluteEntry = join(projectRoot, entry);
    if (!existsSync(absoluteEntry) || !statSync(absoluteEntry).isDirectory()) {
      throw new Error(`${file} entry does not exist as a directory: ${entry}`);
    }
  }
}

function readBaselineManifest(projectRoot: string, file: string, key: string): string[] | undefined {
  const baselineRef = readBaselineRef(projectRoot);
  if (baselineRef === undefined) {
    return undefined;
  }

  try {
    return parseLintPolicyManifest(
      execFileSync("git", ["show", `${baselineRef}:${file}`], {
        cwd: projectRoot,
        encoding: "utf-8",
        env: withoutGitEnvironment(process.env),
        stdio: ["ignore", "pipe", "ignore"],
      }),
      `${baselineRef}:${file}`,
      key,
    );
  } catch {
    return undefined;
  }
}

function readBaselineRef(projectRoot: string): string | undefined {
  const pullRequestBase = readPullRequestBaseRef(projectRoot);
  if (pullRequestBase !== undefined) {
    return pullRequestBase;
  }

  for (const baseBranchRef of BASE_BRANCH_REFS) {
    const mergeBase = readMergeBase(projectRoot, baseBranchRef);
    if (mergeBase !== undefined) {
      return mergeBase;
    }
  }

  return readGitRef(projectRoot, ["rev-parse", "--verify", "HEAD"]);
}

function readPullRequestBaseRef(projectRoot: string): string | undefined {
  const secondParent = readGitRef(projectRoot, ["rev-parse", "--verify", "HEAD^2"]);
  if (secondParent === undefined) {
    return undefined;
  }
  return readGitRef(projectRoot, ["rev-parse", "--verify", "HEAD^1"]);
}

function readMergeBase(projectRoot: string, baseBranchRef: string): string | undefined {
  return readGitRef(projectRoot, ["merge-base", "HEAD", baseBranchRef]);
}

function readGitRef(projectRoot: string, args: readonly string[]): string | undefined {
  try {
    const output = execFileSync("git", [...args], {
      cwd: projectRoot,
      encoding: "utf-8",
      env: withoutGitEnvironment(process.env),
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.trim() || undefined;
  } catch {
    return undefined;
  }
}

function withoutGitEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned = { ...env };
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith("GIT_")) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

function assertManifestDoesNotGrow(
  projectRoot: string,
  file: string,
  key: string,
  entries: string[],
): void {
  const baselineEntries = readBaselineManifest(projectRoot, file, key);

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

function validateLegacySpecSuffixNodeManifest(projectRoot: string, entries: string[]): void {
  assertManifestEntries(
    projectRoot,
    LEGACY_SPEC_SUFFIX_NODE_MANIFEST_FILE,
    entries,
    LEGACY_SPEC_NODE_SUFFIX_PATTERN,
    "end in .capability, .feature, or .story",
  );
  assertManifestDoesNotGrow(
    projectRoot,
    LEGACY_SPEC_SUFFIX_NODE_MANIFEST_FILE,
    LEGACY_SPEC_SUFFIX_NODE_MANIFEST_KEY,
    entries,
  );

  const manifestEntrySet = new Set(entries);
  const legacySpecNodePaths = listLegacySpecNodePaths(projectRoot);
  const untrackedLegacySpecNodes = legacySpecNodePaths.filter((entry) => !manifestEntrySet.has(entry));

  if (untrackedLegacySpecNodes.length > 0) {
    throw new Error(
      `Legacy Spec Tree suffix paths must be listed in ${LEGACY_SPEC_SUFFIX_NODE_MANIFEST_FILE}: ${
        untrackedLegacySpecNodes.join(", ")
      }`,
    );
  }
}

function validateTestLintDebtNodeManifest(projectRoot: string, entries: string[]): void {
  assertManifestEntries(
    projectRoot,
    TEST_LINT_DEBT_NODE_MANIFEST_FILE,
    entries,
    SPEC_TREE_NODE_SUFFIX_PATTERN,
    "be a Spec Tree node path",
  );
  assertManifestDoesNotGrow(
    projectRoot,
    TEST_LINT_DEBT_NODE_MANIFEST_FILE,
    TEST_LINT_DEBT_NODE_MANIFEST_KEY,
    entries,
  );
}

export function validateLintPolicy(projectRoot: string): LintPolicyResult {
  try {
    const legacyManifestExists = manifestExists(projectRoot, LEGACY_SPEC_SUFFIX_NODE_MANIFEST_FILE);
    const testDebtManifestExists = manifestExists(projectRoot, TEST_LINT_DEBT_NODE_MANIFEST_FILE);
    if (!legacyManifestExists && !testDebtManifestExists) {
      return { ok: true };
    }
    if (!legacyManifestExists || !testDebtManifestExists) {
      return {
        ok: false,
        error: "lint policy manifests must be present together",
      };
    }

    validateLegacySpecSuffixNodeManifest(
      projectRoot,
      readManifest(projectRoot, LEGACY_SPEC_SUFFIX_NODE_MANIFEST_FILE, LEGACY_SPEC_SUFFIX_NODE_MANIFEST_KEY),
    );
    validateTestLintDebtNodeManifest(
      projectRoot,
      readManifest(projectRoot, TEST_LINT_DEBT_NODE_MANIFEST_FILE, TEST_LINT_DEBT_NODE_MANIFEST_KEY),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
