import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { WORK_ITEM_KINDS } from "@/types";
import { validateLintPolicy } from "@/validation/lint-policy";
import { LINT_POLICY_BASE_REFS, LINT_POLICY_MANIFESTS } from "@/validation/lint-policy-constants";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  type GitTestEnvironmentOverrides,
  readGit,
  runGit,
  runTsxEval,
} from "@test/harness/git-test-constants";

const LEGACY_MANIFEST_FILE = LINT_POLICY_MANIFESTS.LEGACY_SPEC_SUFFIX_NODES.file;
const LEGACY_MANIFEST_KEY = LINT_POLICY_MANIFESTS.LEGACY_SPEC_SUFFIX_NODES.key;
const TEST_DEBT_MANIFEST_FILE = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.file;
const TEST_DEBT_MANIFEST_KEY = LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.key;
const BASE_LEGACY_PATH = "spx/10-old.story";
const BASE_TEST_DEBT_PATH = "spx/20-current.enabler";
const ADDED_TEST_DEBT_PATH = "spx/30-added.enabler";
const LINT_POLICY_TEST_BRANCH = `${WORK_ITEM_KINDS[1]}-branch`;
const OUTER_REPO_BRANCH = "outer-main";
const OUTER_REPO_USER_NAME = "Outer Repo User";
const OUTER_REPO_USER_EMAIL = "outer@test.local";
const JSON_OBJECT_ERROR_FRAGMENT = "must contain a JSON object";
const LINT_POLICY_TEST_PROJECT_ROOT_ENV = "SPX_LINT_POLICY_TEST_PROJECT_ROOT";

interface SerializedLintPolicyResult {
  readonly ok: boolean;
  readonly error?: string;
}

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

async function commitAll(
  projectRoot: string,
  message: string,
  envOverrides: GitTestEnvironmentOverrides = {},
): Promise<void> {
  await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.ADD, "."], envOverrides);
  await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.COMMIT, "-m", message], envOverrides);
}

function parseSerializedLintPolicyResult(stdout: string): SerializedLintPolicyResult {
  const parsed = JSON.parse(stdout) as Partial<SerializedLintPolicyResult>;
  if (typeof parsed.ok !== "boolean") {
    throw new Error("Lint policy child process returned invalid JSON");
  }
  if (parsed.error !== undefined && typeof parsed.error !== "string") {
    throw new Error("Lint policy child process returned invalid error JSON");
  }
  return parsed.ok ? { ok: true } : { ok: false, error: parsed.error };
}

async function validateLintPolicyInChildProcess(
  projectRoot: string,
  envOverrides: GitTestEnvironmentOverrides,
): Promise<SerializedLintPolicyResult> {
  const moduleUrl = pathToFileURL(join(process.cwd(), "src/validation/lint-policy.ts")).href;
  const script = `
    import { validateLintPolicy } from ${JSON.stringify(moduleUrl)};
    const projectRoot = process.env.${LINT_POLICY_TEST_PROJECT_ROOT_ENV};
    if (projectRoot === undefined) {
      throw new Error("Missing ${LINT_POLICY_TEST_PROJECT_ROOT_ENV}");
    }
    console.log(JSON.stringify(validateLintPolicy(projectRoot)));
  `;
  const stdout = await runTsxEval(process.cwd(), script, {
    ...envOverrides,
    [LINT_POLICY_TEST_PROJECT_ROOT_ENV]: projectRoot,
  });
  return parseSerializedLintPolicyResult(stdout);
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

  it("skips shrink-only comparison when no merge or base branch baseline exists", async () => {
    await withPolicyProject(async (projectRoot) => {
      await runGit(projectRoot, [
        GIT_TEST_SUBCOMMANDS.INIT,
        "--initial-branch",
        LINT_POLICY_TEST_BRANCH,
      ]);
      await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", GIT_TEST_CONFIG.EMAIL]);
      await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", GIT_TEST_CONFIG.USER_NAME]);
      await mkdir(join(projectRoot, BASE_LEGACY_PATH), { recursive: true });
      await mkdir(join(projectRoot, ADDED_TEST_DEBT_PATH), { recursive: true });
      await writePolicyManifest(projectRoot, {
        legacySpecSuffixNodes: [BASE_LEGACY_PATH],
        testLintDebtNodes: [ADDED_TEST_DEBT_PATH],
      });
      await commitAll(projectRoot, "manifests without baseline branch");

      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(true);
    });
  });

  it("keeps nested fixture Git commands inside the fixture when hook Git variables are present", async () => {
    await withPolicyProject(async (outerRoot) => {
      await runGit(outerRoot, [
        GIT_TEST_SUBCOMMANDS.INIT,
        "--initial-branch",
        OUTER_REPO_BRANCH,
      ]);
      await runGit(outerRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", OUTER_REPO_USER_EMAIL]);
      await runGit(outerRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", OUTER_REPO_USER_NAME]);
      await runGit(outerRoot, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.ALLOW_EMPTY, "-m", "outer sentinel"]);
      const outerGitDir = join(outerRoot, ".git");
      const pollutedGitEnvironment = {
        GIT_DIR: outerGitDir,
        GIT_WORK_TREE: outerRoot,
      };

      await withPolicyProject(async (projectRoot) => {
        await runGit(projectRoot, [
          GIT_TEST_SUBCOMMANDS.INIT,
          "--initial-branch",
          LINT_POLICY_BASE_REFS.LOCAL_MAIN,
        ], pollutedGitEnvironment);
        await runGit(projectRoot, [
          GIT_TEST_SUBCOMMANDS.CONFIG,
          "user.email",
          GIT_TEST_CONFIG.EMAIL,
        ], pollutedGitEnvironment);
        await runGit(projectRoot, [
          GIT_TEST_SUBCOMMANDS.CONFIG,
          "user.name",
          GIT_TEST_CONFIG.USER_NAME,
        ], pollutedGitEnvironment);
        await mkdir(join(projectRoot, BASE_LEGACY_PATH), { recursive: true });
        await mkdir(join(projectRoot, BASE_TEST_DEBT_PATH), { recursive: true });
        await writePolicyManifest(projectRoot, {
          legacySpecSuffixNodes: [BASE_LEGACY_PATH],
          testLintDebtNodes: [BASE_TEST_DEBT_PATH],
        });
        await commitAll(projectRoot, "base manifests", pollutedGitEnvironment);
        await runGit(
          projectRoot,
          [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", LINT_POLICY_TEST_BRANCH],
          pollutedGitEnvironment,
        );

        const result = await validateLintPolicyInChildProcess(projectRoot, pollutedGitEnvironment);
        expect(result.ok).toBe(true);
      });

      await expect(readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.BRANCH, GIT_TEST_FLAGS.SHOW_CURRENT])).resolves.toBe(
        OUTER_REPO_BRANCH,
      );
      await expect(readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "--get", "user.email"])).resolves.toBe(
        OUTER_REPO_USER_EMAIL,
      );
      await expect(readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "--get", "user.name"])).resolves.toBe(
        OUTER_REPO_USER_NAME,
      );
    });
  });

  it("rejects corrupt baseline manifests instead of skipping the shrink-only check", async () => {
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
      await writeFile(
        join(projectRoot, LEGACY_MANIFEST_FILE),
        JSON.stringify({ [LEGACY_MANIFEST_KEY]: [BASE_LEGACY_PATH] }, null, 2),
      );
      await writeFile(join(projectRoot, TEST_DEBT_MANIFEST_FILE), JSON.stringify([], null, 2));
      await commitAll(projectRoot, "corrupt baseline manifest");

      await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", LINT_POLICY_TEST_BRANCH]);
      await writePolicyManifest(projectRoot, {
        legacySpecSuffixNodes: [BASE_LEGACY_PATH],
        testLintDebtNodes: [BASE_TEST_DEBT_PATH],
      });

      const result = validateLintPolicy(projectRoot);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(TEST_DEBT_MANIFEST_FILE);
        expect(result.error).toContain(JSON_OBJECT_ERROR_FRAGMENT);
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
