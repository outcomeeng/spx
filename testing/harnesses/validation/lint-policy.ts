import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { lintCommand, type LintCommandDeps } from "@/commands/validation/lint";
import { VALIDATION_EXIT_CODES } from "@/commands/validation/messages";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { validateLintPolicy } from "@/validation/lint-policy";
import { validateESLint } from "@/validation/steps/eslint";
import {
  VALIDATION_LINT_POLICY_DATA,
  VALIDATION_LINT_POLICY_SCENARIO_KIND,
  type ValidationLintPolicyManifestEntries,
  type ValidationLintPolicyScenario,
  validationLintPolicyScenarios,
} from "@testing/generators/validation/lint-policy";
import {
  GIT_TEST_COMMAND,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  type GitTestEnvironmentOverrides,
  readGit,
  runGit,
  runTsxEval,
} from "@testing/harnesses/git-test-constants";
import { RecordingSpawnOptionsRunner } from "@testing/harnesses/validation/subprocess";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

interface SerializedLintPolicyResult {
  readonly ok: boolean;
  readonly error?: string;
}

export function registerValidationLintPolicyTests(): void {
  describe("lint policy validation", () => {
    for (const scenario of validationLintPolicyScenarios()) {
      it(scenario.title, async () => {
        await runValidationLintPolicyScenario(scenario);
      });
    }
    it("runs repository lint policy inside the lint command", runLintCommandPolicyScenario);
    it("does not run repository lint policy while loading the ESLint config", runEslintConfigLoadScenario);
  });
}

async function writePolicyBoundaryFixture(productDir: string): Promise<void> {
  await mkdir(join(productDir, VALIDATION_LINT_POLICY_DATA.deprecatedSpecNodePath), { recursive: true });
  await writePolicyConfigFixture(productDir);
}

async function writePolicyConfigFixture(productDir: string): Promise<void> {
  await writePolicyManifest(productDir, {
    testLintDebtNodes: [],
  });
  await writeFile(
    join(productDir, VALIDATION_LINT_POLICY_DATA.typescriptConfigFile),
    VALIDATION_LINT_POLICY_DATA.typescriptConfigMarkerContent,
  );
  await writeFile(
    join(productDir, VALIDATION_LINT_POLICY_DATA.eslintConfigFile),
    VALIDATION_LINT_POLICY_DATA.eslintConfigMarkerContent,
  );
}

async function runLintCommandPolicyScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    await writePolicyBoundaryFixture(productDir);
    const runner = new RecordingSpawnOptionsRunner();
    const toolPath = join(productDir, VALIDATION_LINT_POLICY_DATA.policyToolPath);
    const deps: LintCommandDeps = {
      discoverTool: async (tool) => ({
        found: true,
        location: { tool, path: toolPath, source: TOOL_DISCOVERY.SOURCES.GLOBAL },
      }),
      validateESLint: (context, _runner, outputStreams) => validateESLint(context, runner, outputStreams),
    };

    const result = await lintCommand({ cwd: productDir, quiet: true }, deps);

    expect(result.exitCode).toBe(VALIDATION_EXIT_CODES.FAILURE);
    expect(result.output).toContain(VALIDATION_LINT_POLICY_DATA.deprecatedSpecNodePath);
    expect(runner.commands).toEqual([]);
  });
}

async function runEslintConfigLoadScenario(): Promise<void> {
  await withPolicyProject(async (productDir) => {
    await writePolicyConfigFixture(productDir);
    const probeDirectory = join(productDir, VALIDATION_LINT_POLICY_DATA.configLoadGitProbeDirectory);
    const markerPath = join(productDir, VALIDATION_LINT_POLICY_DATA.configLoadPolicyMarker);
    const gitProbePath = join(probeDirectory, GIT_TEST_COMMAND);
    await mkdir(probeDirectory, { recursive: true });
    await writeFile(gitProbePath, `#!/bin/sh\nprintf invoked > ${JSON.stringify(markerPath)}\nexit 1\n`);
    await chmod(gitProbePath, 0o755);
    const moduleUrl = pathToFileURL(join(process.cwd(), VALIDATION_LINT_POLICY_DATA.eslintConfigFile)).href;
    const stdout = await runTsxEval(
      process.cwd(),
      `await import(${JSON.stringify(moduleUrl)});`,
      { PATH: `${probeDirectory}${delimiter}${process.env.PATH ?? ""}` },
      productDir,
    );

    expect(stdout).toHaveLength(0);
    expect(existsSync(markerPath)).toBe(false);
  });
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
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.TEST_OWNED_CONSTANT_BRANCH_ADDITION:
      return runTestOwnedConstantDebtAdditionScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.BASELINE_ABSENT:
      return runBaselineAbsentScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.HOOK_GIT_VARIABLES:
      return runHookGitVariablesScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.CORRUPT_BASELINE:
      return runCorruptBaselineScenario();
    case VALIDATION_LINT_POLICY_SCENARIO_KIND.DEPRECATED_SPEC_NODE_SUFFIX:
      return runDeprecatedSpecNodeSuffixScenario();
  }
}

function withPolicyProject(callback: (productDir: string) => Promise<void>): Promise<void> {
  return withTempDir(VALIDATION_LINT_POLICY_DATA.tempPrefix, callback);
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

async function commitPostDebtBranchState(productDir: string): Promise<void> {
  await runGit(productDir, [
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.ALLOW_EMPTY,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    VALIDATION_LINT_POLICY_DATA.commitMessages.postDebt,
  ]);
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
    await commitPostDebtBranchState(productDir);

    const result = validateLintPolicy(productDir);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES.file);
      expect(result.error).toContain(VALIDATION_LINT_POLICY_DATA.addedTestDebtPath);
    }
  });
}

async function runTestOwnedConstantDebtAdditionScenario(): Promise<void> {
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
    await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.addedDebt);
    await commitPostDebtBranchState(productDir);

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
