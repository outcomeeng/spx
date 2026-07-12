import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "vitest";

import { lintCommand } from "@/commands/validation/lint";
import { VALIDATION_EXIT_CODES, VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import { resolveConfig } from "@/config";
import { detectTypeScript } from "@/validation/discovery";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { validateLintPolicy } from "@/validation/lint-policy";
import { validateESLint } from "@/validation/steps/eslint";
import { DEFAULT_ESLINT_CONFIG_FILE } from "@/validation/steps/eslint-contract";
import {
  VALIDATION_LINT_POLICY_DATA,
  VALIDATION_LINT_POLICY_SCENARIO_KIND,
  type ValidationLintPolicyManifestEntries,
  type ValidationLintPolicyScenario,
} from "@testing/generators/validation/lint-policy";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  type GitTestEnvironmentOverrides,
  readGit,
  runGit,
  runTsxEval,
} from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const LINT_POLICY_TEMP_PREFIX = "spx-lint-policy-";

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
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.DEPRECATED_SPEC_NODE_SUFFIX:
      return runDeprecatedSpecNodeSuffixScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.CONFIG_LOAD_BOUNDARY:
      return runConfigLoadBoundaryScenario();
  }
}

function withPolicyProject(callback: (productDir: string) => Promise<void>): Promise<void> {
  return withTempDir(LINT_POLICY_TEMP_PREFIX, callback);
}

async function writePolicyManifest(
  productDir: string,
  entries: ValidationLintPolicyManifestEntries,
): Promise<void> {
  const testDebtManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES;
  const testOwnedConstantManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES;

  await writeFile(
    join(productDir, testDebtManifest.file),
    JSON.stringify({ [testDebtManifest.key]: entries.testLintDebtNodes }, null, 2),
  );
  await writeFile(
    join(productDir, testOwnedConstantManifest.file),
    JSON.stringify({ [testOwnedConstantManifest.key]: entries.testOwnedConstantDebtNodes ?? [] }, null, 2),
  );
}

async function commitAll(
  productDir: string,
  message: string,
  envOverrides: GitTestEnvironmentOverrides = {},
): Promise<void> {
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, "."], envOverrides);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.COMMIT, "-m", message], envOverrides);
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
  productDir: string,
  envOverrides: GitTestEnvironmentOverrides,
): Promise<SerializedLintPolicyResult> {
  const moduleUrl = pathToFileURL(join(process.cwd(), "src/validation/lint-policy.ts")).href;
  const environmentKey = VALIDATION_LINT_POLICY_DATA.productDirEnvironmentKey;
  const script = `
    import { validateLintPolicy } from ${JSON.stringify(moduleUrl)};
    const productDir = process.env.${environmentKey};
    if (productDir === undefined) {
      throw new Error("Missing ${environmentKey}");
    }
    console.log(JSON.stringify(validateLintPolicy(productDir)));
  `;
  const stdout = await runTsxEval(process.cwd(), script, {
    ...envOverrides,
    [environmentKey]: productDir,
  });
  return parseSerializedLintPolicyResult(stdout);
}

async function initializePolicyRepository(
  productDir: string,
  branch: string,
  envOverrides: GitTestEnvironmentOverrides = {},
): Promise<void> {
  await runGit(productDir, [
    GIT_TEST_SUBCOMMANDS.INIT,
    "--initial-branch",
    branch,
  ], envOverrides);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.email", GIT_TEST_CONFIG.EMAIL], envOverrides);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, "user.name", GIT_TEST_CONFIG.USER_NAME], envOverrides);
}

async function writeBaseDebtFixture(productDir: string): Promise<void> {
  await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.baseTestDebtPath), { recursive: true });
  await writePolicyManifest(productDir, {
    testLintDebtNodes: [VALIDATION_LINT_POLICY_DATA.baseTestDebtPath],
  });
}

async function runUnrelatedProjectScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    const result = validateLintPolicy(productDir);

    expect(result.ok).toBe(true);
  });
}

async function runExistingDebtScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    await writeBaseDebtFixture(productDir);

    const result = validateLintPolicy(productDir);

    expect(result.ok).toBe(true);
  });
}

async function runBranchAdditionScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    await prepareBranchAdditionPolicyProject(productDir);

    const result = validateLintPolicy(productDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES.file);
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.addedTestDebtPath);
    }

    await writeFile(
      join(productDir, VALIDATION_PIPELINE_DATA.fullTsconfigFile),
      JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
    );
    await writeFile(join(productDir, DEFAULT_ESLINT_CONFIG_FILE), "");
    const commandResult = await lintCommand(
      { cwd: productDir },
      {
        detectTypeScript,
        discoverTool: async () => ({
          found: true,
          location: {
            tool: VALIDATION_STAGE_DISPLAY_NAMES.ESLINT,
            path: productDir,
            source: TOOL_DISCOVERY.SOURCES.PROJECT,
          },
        }),
        resolveConfig,
        validateESLint,
      },
    );
    expect(commandResult.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    expect(commandResult.output).toContain(VALIDATION_LINT_POLICY_DATA.addedTestDebtPath);
  });
}

async function prepareBranchAdditionPolicyProject(productDir: string): Promise<void> {
  await initializePolicyRepository(productDir, VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN);
  await writeBaseDebtFixture(productDir);
  await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.base);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch]);
  await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.addedTestDebtPath), { recursive: true });
  await writePolicyManifest(productDir, {
    testLintDebtNodes: [
      VALIDATION_LINT_POLICY_DATA.baseTestDebtPath,
      VALIDATION_LINT_POLICY_DATA.addedTestDebtPath,
    ],
  });
  await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.addedDebt);
}

async function runConfigLoadBoundaryScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    await prepareBranchAdditionPolicyProject(productDir);
    await writeFile(
      join(productDir, VALIDATION_PIPELINE_DATA.fullTsconfigFile),
      JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
    );
    const configUrl = pathToFileURL(join(process.cwd(), DEFAULT_ESLINT_CONFIG_FILE)).href;
    const script = `
      process.chdir(${JSON.stringify(productDir)});
      await import(${JSON.stringify(configUrl)});
      console.log(${JSON.stringify(VALIDATION_LINT_POLICY_DATA.configLoadSuccessMarker)});
    `;

    await expect(runTsxEval(process.cwd(), script)).resolves.toContain(
      VALIDATION_LINT_POLICY_DATA.configLoadSuccessMarker,
    );
  });
}

export async function runTestOwnedConstantDebtAdditionScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    await initializePolicyRepository(productDir, VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN);
    await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.baseTestDebtPath), { recursive: true });
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [],
      testOwnedConstantDebtNodes: [VALIDATION_LINT_POLICY_DATA.baseTestDebtPath],
    });
    await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.base);

    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch]);
    await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.addedTestDebtPath), { recursive: true });
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [],
      testOwnedConstantDebtNodes: [
        VALIDATION_LINT_POLICY_DATA.baseTestDebtPath,
        VALIDATION_LINT_POLICY_DATA.addedTestDebtPath,
      ],
    });

    const result = validateLintPolicy(productDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(
        VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES.file,
      );
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.addedTestDebtPath);
    }
  });
}

async function runBaselineAbsentScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    await initializePolicyRepository(productDir, VALIDATION_LINT_POLICY_DATA.testBranch);
    await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.addedTestDebtPath), { recursive: true });
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [VALIDATION_LINT_POLICY_DATA.addedTestDebtPath],
    });
    await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.baselineAbsent);

    const result = validateLintPolicy(productDir);

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

    await withPolicyProject(async (productDir) => {
      await initializePolicyRepository(
        productDir,
        VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN,
        pollutedGitEnvironment,
      );
      await writeBaseDebtFixture(productDir);
      await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.base, pollutedGitEnvironment);
      await runGit(
        productDir,
        [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch],
        pollutedGitEnvironment,
      );

      const result = await validateLintPolicyInChildProcess(productDir, pollutedGitEnvironment);
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
  await withPolicyProject(async (productDir) => {
    const testDebtManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES;
    const testOwnedConstantManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES;

    await initializePolicyRepository(productDir, VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN);
    await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.baseTestDebtPath), { recursive: true });
    await writeFile(join(productDir, testDebtManifest.file), JSON.stringify([], null, 2));
    await writeFile(
      join(productDir, testOwnedConstantManifest.file),
      JSON.stringify({ [testOwnedConstantManifest.key]: [] }, null, 2),
    );
    await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.corruptBaseline);

    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch]);
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [VALIDATION_LINT_POLICY_DATA.baseTestDebtPath],
    });

    const result = validateLintPolicy(productDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(testDebtManifest.file);
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.jsonObjectErrorFragment);
    }
  });
}

async function runDeprecatedSpecNodeSuffixScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.deprecatedSpecNodePath), { recursive: true });
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [],
    });

    const result = validateLintPolicy(productDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.deprecatedSpecNodePath);
    }
  });
}
