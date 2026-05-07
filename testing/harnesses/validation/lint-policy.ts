import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "vitest";

import { validateLintPolicy } from "@/validation/lint-policy";
import {
  VALIDATION_LINT_POLICY_DATA,
  VALIDATION_LINT_POLICY_SCENARIO_KIND,
  type ValidationLintPolicyManifestEntries,
  type ValidationLintPolicyScenario,
} from "@testing/generators/validation/lint-policy";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  type GitTestEnvironmentOverrides,
  readGit,
  runGit,
  runTsxEval,
} from "@testing/harnesses/git-test-constants";

interface SerializedLintPolicyResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function runValidationLintPolicyScenario(
  scenario: ValidationLintPolicyScenario,
): Promise<void> {
  switch (scenario.kind) {
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.UNRELATED_PROJECT:
      return runUnrelatedProjectScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.EXISTING_DEBT:
      return runExistingDebtScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.BRANCH_ADDITION:
      return runBranchAdditionScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.BASELINE_ABSENT:
      return runBaselineAbsentScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.HOOK_GIT_VARIABLES:
      return runHookGitVariablesScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.CORRUPT_BASELINE:
      return runCorruptBaselineScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.MISSING_LEGACY_MANIFEST_ENTRY:
      return runMissingLegacyManifestEntryScenario();
  }
}

async function withPolicyProject(callback: (projectRoot: string) => Promise<void>): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), VALIDATION_LINT_POLICY_DATA.tempPrefix));
  try {
    await callback(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

async function writePolicyManifest(
  projectRoot: string,
  entries: ValidationLintPolicyManifestEntries,
): Promise<void> {
  const legacyManifest = VALIDATION_LINT_POLICY_DATA.manifests.LEGACY_SPEC_SUFFIX_NODES;
  const testDebtManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES;
  const testOwnedConstantManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES;

  await writeFile(
    join(projectRoot, legacyManifest.file),
    JSON.stringify({ [legacyManifest.key]: entries.legacySpecSuffixNodes }, null, 2),
  );
  await writeFile(
    join(projectRoot, testDebtManifest.file),
    JSON.stringify({ [testDebtManifest.key]: entries.testLintDebtNodes }, null, 2),
  );
  await writeFile(
    join(projectRoot, testOwnedConstantManifest.file),
    JSON.stringify({ [testOwnedConstantManifest.key]: entries.testOwnedConstantDebtNodes ?? [] }, null, 2),
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
  const environmentKey = VALIDATION_LINT_POLICY_DATA.projectRootEnvironmentKey;
  const script = `
    import { validateLintPolicy } from ${JSON.stringify(moduleUrl)};
    const projectRoot = process.env.${environmentKey};
    if (projectRoot === undefined) {
      throw new Error("Missing ${environmentKey}");
    }
    console.log(JSON.stringify(validateLintPolicy(projectRoot)));
  `;
  const stdout = await runTsxEval(process.cwd(), script, {
    ...envOverrides,
    [environmentKey]: projectRoot,
  });
  return parseSerializedLintPolicyResult(stdout);
}

async function initializePolicyRepository(
  projectRoot: string,
  branch: string,
  envOverrides: GitTestEnvironmentOverrides = {},
): Promise<void> {
  await runGit(projectRoot, [
    GIT_TEST_SUBCOMMANDS.INIT,
    "--initial-branch",
    branch,
  ], envOverrides);
  await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", GIT_TEST_CONFIG.EMAIL], envOverrides);
  await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", GIT_TEST_CONFIG.USER_NAME], envOverrides);
}

async function writeBaseDebtFixture(projectRoot: string): Promise<void> {
  await mkdir(join(projectRoot, VALIDATION_LINT_POLICY_DATA.baseLegacyPath), { recursive: true });
  await mkdir(join(projectRoot, VALIDATION_LINT_POLICY_DATA.baseTestDebtPath), { recursive: true });
  await writePolicyManifest(projectRoot, {
    legacySpecSuffixNodes: [VALIDATION_LINT_POLICY_DATA.baseLegacyPath],
    testLintDebtNodes: [VALIDATION_LINT_POLICY_DATA.baseTestDebtPath],
  });
}

async function runUnrelatedProjectScenario(): Promise<void> {
  await withPolicyProject(async (projectRoot) => {
    const result = validateLintPolicy(projectRoot);

    expect(result.ok).toBe(true);
  });
}

async function runExistingDebtScenario(): Promise<void> {
  await withPolicyProject(async (projectRoot) => {
    await writeBaseDebtFixture(projectRoot);

    const result = validateLintPolicy(projectRoot);

    expect(result.ok).toBe(true);
  });
}

async function runBranchAdditionScenario(): Promise<void> {
  await withPolicyProject(async (projectRoot) => {
    await initializePolicyRepository(projectRoot, VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN);
    await writeBaseDebtFixture(projectRoot);
    await commitAll(projectRoot, VALIDATION_LINT_POLICY_DATA.commitMessages.base);

    await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch]);
    await mkdir(join(projectRoot, VALIDATION_LINT_POLICY_DATA.addedTestDebtPath), { recursive: true });
    await writePolicyManifest(projectRoot, {
      legacySpecSuffixNodes: [VALIDATION_LINT_POLICY_DATA.baseLegacyPath],
      testLintDebtNodes: [
        VALIDATION_LINT_POLICY_DATA.baseTestDebtPath,
        VALIDATION_LINT_POLICY_DATA.addedTestDebtPath,
      ],
    });
    await commitAll(projectRoot, VALIDATION_LINT_POLICY_DATA.commitMessages.addedDebt);

    const result = validateLintPolicy(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES.file);
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.addedTestDebtPath);
    }
  });
}

async function runBaselineAbsentScenario(): Promise<void> {
  await withPolicyProject(async (projectRoot) => {
    await initializePolicyRepository(projectRoot, VALIDATION_LINT_POLICY_DATA.testBranch);
    await mkdir(join(projectRoot, VALIDATION_LINT_POLICY_DATA.baseLegacyPath), { recursive: true });
    await mkdir(join(projectRoot, VALIDATION_LINT_POLICY_DATA.addedTestDebtPath), { recursive: true });
    await writePolicyManifest(projectRoot, {
      legacySpecSuffixNodes: [VALIDATION_LINT_POLICY_DATA.baseLegacyPath],
      testLintDebtNodes: [VALIDATION_LINT_POLICY_DATA.addedTestDebtPath],
    });
    await commitAll(projectRoot, VALIDATION_LINT_POLICY_DATA.commitMessages.baselineAbsent);

    const result = validateLintPolicy(projectRoot);

    expect(result.ok).toBe(true);
  });
}

async function runHookGitVariablesScenario(): Promise<void> {
  await withPolicyProject(async (outerRoot) => {
    await runGit(outerRoot, [
      GIT_TEST_SUBCOMMANDS.INIT,
      "--initial-branch",
      VALIDATION_LINT_POLICY_DATA.outerRepoBranch,
    ]);
    await runGit(outerRoot, [
      GIT_TEST_SUBCOMMANDS.CONFIG,
      "user.email",
      VALIDATION_LINT_POLICY_DATA.outerRepoUserEmail,
    ]);
    await runGit(outerRoot, [
      GIT_TEST_SUBCOMMANDS.CONFIG,
      "user.name",
      VALIDATION_LINT_POLICY_DATA.outerRepoUserName,
    ]);
    await runGit(outerRoot, [
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.ALLOW_EMPTY,
      "-m",
      VALIDATION_LINT_POLICY_DATA.commitMessages.outerSentinel,
    ]);
    const pollutedGitEnvironment = {
      GIT_DIR: join(outerRoot, ".git"),
      GIT_WORK_TREE: outerRoot,
    };

    await withPolicyProject(async (projectRoot) => {
      await initializePolicyRepository(
        projectRoot,
        VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN,
        pollutedGitEnvironment,
      );
      await writeBaseDebtFixture(projectRoot);
      await commitAll(projectRoot, VALIDATION_LINT_POLICY_DATA.commitMessages.base, pollutedGitEnvironment);
      await runGit(
        projectRoot,
        [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch],
        pollutedGitEnvironment,
      );

      const result = await validateLintPolicyInChildProcess(projectRoot, pollutedGitEnvironment);
      expect(result.ok).toBe(true);
    });

    await expect(readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.BRANCH, GIT_TEST_FLAGS.SHOW_CURRENT])).resolves.toBe(
      VALIDATION_LINT_POLICY_DATA.outerRepoBranch,
    );
    await expect(readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "--get", "user.email"])).resolves.toBe(
      VALIDATION_LINT_POLICY_DATA.outerRepoUserEmail,
    );
    await expect(readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "--get", "user.name"])).resolves.toBe(
      VALIDATION_LINT_POLICY_DATA.outerRepoUserName,
    );
  });
}

async function runCorruptBaselineScenario(): Promise<void> {
  await withPolicyProject(async (projectRoot) => {
    const legacyManifest = VALIDATION_LINT_POLICY_DATA.manifests.LEGACY_SPEC_SUFFIX_NODES;
    const testDebtManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES;
    const testOwnedConstantManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES;

    await initializePolicyRepository(projectRoot, VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN);
    await mkdir(join(projectRoot, VALIDATION_LINT_POLICY_DATA.baseLegacyPath), { recursive: true });
    await mkdir(join(projectRoot, VALIDATION_LINT_POLICY_DATA.baseTestDebtPath), { recursive: true });
    await writeFile(
      join(projectRoot, legacyManifest.file),
      JSON.stringify({ [legacyManifest.key]: [VALIDATION_LINT_POLICY_DATA.baseLegacyPath] }, null, 2),
    );
    await writeFile(join(projectRoot, testDebtManifest.file), JSON.stringify([], null, 2));
    await writeFile(
      join(projectRoot, testOwnedConstantManifest.file),
      JSON.stringify({ [testOwnedConstantManifest.key]: [] }, null, 2),
    );
    await commitAll(projectRoot, VALIDATION_LINT_POLICY_DATA.commitMessages.corruptBaseline);

    await runGit(projectRoot, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch]);
    await writePolicyManifest(projectRoot, {
      legacySpecSuffixNodes: [VALIDATION_LINT_POLICY_DATA.baseLegacyPath],
      testLintDebtNodes: [VALIDATION_LINT_POLICY_DATA.baseTestDebtPath],
    });

    const result = validateLintPolicy(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(testDebtManifest.file);
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.jsonObjectErrorFragment);
    }
  });
}

async function runMissingLegacyManifestEntryScenario(): Promise<void> {
  await withPolicyProject(async (projectRoot) => {
    await mkdir(join(projectRoot, VALIDATION_LINT_POLICY_DATA.baseLegacyPath), { recursive: true });
    await writePolicyManifest(projectRoot, {
      legacySpecSuffixNodes: [],
      testLintDebtNodes: [],
    });

    const result = validateLintPolicy(projectRoot);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.manifests.LEGACY_SPEC_SUFFIX_NODES.file);
    }
  });
}
