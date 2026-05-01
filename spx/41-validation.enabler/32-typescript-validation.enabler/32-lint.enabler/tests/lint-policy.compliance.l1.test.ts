import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { WORK_ITEM_KINDS } from "@/types";
import { validateLintPolicy } from "@/validation/lint-policy";
import { LINT_POLICY_BASE_REFS, LINT_POLICY_MANIFESTS } from "@/validation/lint-policy-constants";
import {
  cleanGitTestEnvironment,
  GIT_TEST_COMMAND,
  GIT_TEST_CONFIG,
  GIT_TEST_SUBCOMMANDS,
} from "@test/harness/git-test-constants";

const LEGACY_MANIFEST_FILE = LINT_POLICY_MANIFESTS.LEGACY_SPEC_SUFFIX_NODES.file;
const LEGACY_MANIFEST_KEY = LINT_POLICY_MANIFESTS.LEGACY_SPEC_SUFFIX_NODES.key;
const TEST_DEBT_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.file;
const TEST_DEBT_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.key;
const BASE_LEGACY_PATH = "spx/10-old.story";
const BASE_TEST_DEBT_PATH = "spx/20-current.enabler";
const ADDED_TEST_DEBT_PATH = "spx/30-added.enabler";
const LINT_POLICY_TEST_BRANCH = `${WORK_ITEM_KINDS[1]}-branch`;

async function withPolicyProject(callback: (projectRoot: string) => Promise<void>): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), "spx-lint-policy-"));
  try {
    await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function writePolicyManifest(
  projectRoot: string,
  entries: {
    readonly legacySpecSuffixNodes: readonly string[];
    readonly testLintDebtNodes: readonly string[];
  },
): Promise<void> {
  await writeFile(
    join(projectRoot, LEGACY_MANIFEST_FILE),
    JSON.stringify({ [LEGACY_MANIFEST_KEY]: entries.legacySpecSuffixNodes }, null, 2),
  );
  await writeFile(
    join(projectRoot, TEST_DEBT_MANIFEST_FILE),
    JSON.stringify({ [TEST_DEBT_MANIFEST_KEY]: entries.testLintDebtNodes }, null, 2),
  );
}

async function runGit(projectRoot: string, args: readonly string[]): Promise<void> {
  await execa(GIT_TEST_COMMAND, [...args], {
    cwd: projectRoot,
    env: cleanGitTestEnvironment(),
    extendEnv: false,
  });
}

async function commitAll(projectRoot: string, message: string): Promise<void> {
  await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.ADD, "."]);
  await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.COMMIT, "-m", message]);
}

describe("lint policy validation", () => {
  it("does not require repository policy manifests in unrelated TypeScript projects", async () => {
    await withPolicyProject(async (projectRoot) => {
      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(true);
    });
  });

  it("accepts manifests that describe existing repository debt without requiring git metadata", async () => {
    await withPolicyProject(async (projectRoot) => {
      await mkdir(join(projectRoot, BASE_LEGACY_PATH), { recursive: true });
      await mkdir(join(projectRoot, BASE_TEST_DEBT_PATH), { recursive: true });
      await writePolicyManifest(projectRoot, {
        legacySpecSuffixNodes: [BASE_LEGACY_PATH],
        testLintDebtNodes: [BASE_TEST_DEBT_PATH],
      });

      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(true);
    });
  });

  it("rejects manifest additions committed on a branch when they are absent from the base branch", async () => {
    await withPolicyProject(async (projectRoot) => {
      await runGit(projectRoot, [
        GIT_TEST_SUBCOMMANDS.INIT,
        "--initial-branch",
        LINT_POLICY_BASE_REFS.LOCAL_MAIN,
      ]);
      await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", GIT_TEST_CONFIG.EMAIL]);
      await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", GIT_TEST_CONFIG.USER_NAME]);
      await mkdir(join(projectRoot, BASE_LEGACY_PATH), { recursive: true });
      await mkdir(join(projectRoot, BASE_TEST_DEBT_PATH), { recursive: true });
      await writePolicyManifest(projectRoot, {
        legacySpecSuffixNodes: [BASE_LEGACY_PATH],
        testLintDebtNodes: [BASE_TEST_DEBT_PATH],
      });
      await commitAll(projectRoot, "base manifests");

      await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", LINT_POLICY_TEST_BRANCH]);
      await mkdir(join(projectRoot, ADDED_TEST_DEBT_PATH), { recursive: true });
      await writePolicyManifest(projectRoot, {
        legacySpecSuffixNodes: [BASE_LEGACY_PATH],
        testLintDebtNodes: [BASE_TEST_DEBT_PATH, ADDED_TEST_DEBT_PATH],
      });
      await commitAll(projectRoot, "add manifest debt");

      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(TEST_DEBT_MANIFEST_FILE);
        expect(result.error).toContain(ADDED_TEST_DEBT_PATH);
      }
    });
  });

  it("rejects legacy suffix nodes that are present in the tree but absent from the manifest", async () => {
    await withPolicyProject(async (projectRoot) => {
      await mkdir(join(projectRoot, BASE_LEGACY_PATH), { recursive: true });
      await writePolicyManifest(projectRoot, {
        legacySpecSuffixNodes: [],
        testLintDebtNodes: [],
      });

      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(LEGACY_MANIFEST_FILE);
      }
    });
  });
});
