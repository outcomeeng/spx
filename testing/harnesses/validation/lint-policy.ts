import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { lintCommand } from "@/commands/validation/lint";
import { VALIDATION_STAGE_DISPLAY_NAMES } from "@/commands/validation/messages";
import { resolveConfig } from "@/config";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { SPEC_TREE_CONFIG, type SpecTreeMethodologyLine } from "@/lib/spec-tree";
import { detectTypeScript } from "@/validation/discovery";
import { TOOL_DISCOVERY } from "@/validation/discovery/constants";
import { type LintPolicyResult, validateLintPolicy } from "@/validation/lint-policy";
import { validateESLint } from "@/validation/steps/eslint";
import { DEFAULT_ESLINT_CONFIG_FILE } from "@/validation/steps/eslint-contract";
import {
  type LintPolicyDebtCase,
  VALIDATION_LINT_POLICY_DATA,
  type ValidationLintPolicyManifestEntries,
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
import { withTestEnv, writeOrderedDirectory } from "@testing/harnesses/spec-tree/spec-tree";
import { writeValidationProductDeclaration } from "@testing/harnesses/validation/product";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const LINT_POLICY_TEMP_PREFIX = "spx-lint-policy-";

export interface SerializedLintPolicyResult {
  readonly ok: boolean;
  readonly error?: string;
}

function withPolicyProject<T>(callback: (productDir: string) => Promise<T>): Promise<T> {
  return withTempDir(LINT_POLICY_TEMP_PREFIX, callback);
}

/** Validates the lint policy of a fixture product whose configuration declares its methodology once the fixture holds a spec tree. */
async function validatePolicy(
  productDir: string,
  line: SpecTreeMethodologyLine,
): ReturnType<typeof validateLintPolicy> {
  await writeValidationProductDeclaration(productDir, line);
  return validateLintPolicy(productDir);
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
  line: SpecTreeMethodologyLine,
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
    console.log(JSON.stringify(await validateLintPolicy(productDir)));
  `;
  await writeValidationProductDeclaration(productDir, line);
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

async function writeBaseDebtFixture(productDir: string, debtCase: LintPolicyDebtCase): Promise<void> {
  await mkdir(join(productDir, debtCase.baseDebtPath), { recursive: true });
  await writePolicyManifest(productDir, {
    testLintDebtNodes: [debtCase.baseDebtPath],
  });
}

/** Observes the lint policy of a product that holds a spec tree node and neither debt manifest. */
export function observePolicyWithoutManifests(debtCase: LintPolicyDebtCase): Promise<LintPolicyResult> {
  return observeLintPolicyOfProduct({
    declaredLine: debtCase.line,
    nodeDirectories: [debtCase.baseDebtPath.slice(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`.length)],
  });
}

/** Observes the lint policy of a product, outside any Git repository, whose manifests list its existing debt node. */
export function observePolicyWithExistingDebt(debtCase: LintPolicyDebtCase): Promise<LintPolicyResult> {
  return withPolicyProject(async (productDir) => {
    await writeBaseDebtFixture(productDir, debtCase);
    return validatePolicy(productDir, debtCase.line);
  });
}

export interface BranchAdditionObservation {
  readonly policy: LintPolicyResult;
  readonly command: { readonly exitCode: number; readonly output: string };
}

/** Observes the policy and the `spx validation lint` command output for a branch whose manifest lists a node the base branch lacks. */
export function observeBranchAddition(debtCase: LintPolicyDebtCase): Promise<BranchAdditionObservation> {
  return withPolicyProject(async (productDir) => {
    await prepareBranchAdditionPolicyProject(productDir, debtCase);
    const policy = await validatePolicy(productDir, debtCase.line);

    await writeFile(
      join(productDir, VALIDATION_PIPELINE_DATA.fullTsconfigFile),
      JSON.stringify({ include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] }),
    );
    await writeFile(join(productDir, DEFAULT_ESLINT_CONFIG_FILE), "");
    const command = await lintCommand(
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
    return { policy, command: { exitCode: command.exitCode, output: command.output } };
  });
}

async function prepareBranchAdditionPolicyProject(productDir: string, debtCase: LintPolicyDebtCase): Promise<void> {
  await initializePolicyRepository(productDir, VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN);
  await writeBaseDebtFixture(productDir, debtCase);
  await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.base);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch]);
  await mkdir(join(productDir, debtCase.addedDebtPath), { recursive: true });
  await writePolicyManifest(productDir, {
    testLintDebtNodes: [debtCase.baseDebtPath, debtCase.addedDebtPath],
  });
  await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.addedDebt);
  await writeValidationProductDeclaration(productDir, debtCase.line);
}

/** Observes the stdout of importing the repository `eslint.config.ts` from a product whose branch adds manifest debt. */
export function observeEslintConfigLoad(debtCase: LintPolicyDebtCase): Promise<string> {
  return withPolicyProject(async (productDir) => {
    await prepareBranchAdditionPolicyProject(productDir, debtCase);
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

    return runTsxEval(process.cwd(), script);
  });
}

/** Observes the policy for a branch whose test-owned-constant manifest lists a node the base branch lacks. */
export function observeTestOwnedConstantDebtAddition(debtCase: LintPolicyDebtCase): Promise<LintPolicyResult> {
  return withPolicyProject(async (productDir) => {
    await initializePolicyRepository(productDir, VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN);
    await mkdir(join(productDir, debtCase.baseDebtPath), { recursive: true });
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [],
      testOwnedConstantDebtNodes: [debtCase.baseDebtPath],
    });
    await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.base);

    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch]);
    await mkdir(join(productDir, debtCase.addedDebtPath), { recursive: true });
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [],
      testOwnedConstantDebtNodes: [debtCase.baseDebtPath, debtCase.addedDebtPath],
    });

    return validatePolicy(productDir, debtCase.line);
  });
}

/** Observes the policy for a repository with manifest debt and no base branch to compare against. */
export function observePolicyWithoutBaseline(debtCase: LintPolicyDebtCase): Promise<LintPolicyResult> {
  return withPolicyProject(async (productDir) => {
    await initializePolicyRepository(productDir, VALIDATION_LINT_POLICY_DATA.testBranch);
    await mkdir(join(productDir, debtCase.addedDebtPath), { recursive: true });
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [debtCase.addedDebtPath],
    });
    await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.baselineAbsent);

    return validatePolicy(productDir, debtCase.line);
  });
}

export interface HookGitVariablesObservation {
  readonly policy: SerializedLintPolicyResult;
  readonly outerBranch: string;
  readonly outerUserEmail: string;
  readonly outerUserName: string;
}

/** Observes the policy run under Git hook variables that point at an outer repository, and that repository's state afterwards. */
export function observePolicyUnderHookGitVariables(debtCase: LintPolicyDebtCase): Promise<HookGitVariablesObservation> {
  return withPolicyProject(async (outerRoot) => {
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

    let policy: SerializedLintPolicyResult | undefined;
    await withPolicyProject(async (productDir) => {
      await initializePolicyRepository(
        productDir,
        VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN,
        pollutedGitEnvironment,
      );
      await writeBaseDebtFixture(productDir, debtCase);
      await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.base, pollutedGitEnvironment);
      await runGit(
        productDir,
        [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch],
        pollutedGitEnvironment,
      );

      policy = await validateLintPolicyInChildProcess(productDir, debtCase.line, pollutedGitEnvironment);
    });
    if (policy === undefined) throw new Error("Lint policy child process did not run");

    return {
      policy,
      outerBranch: await readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.BRANCH, GIT_TEST_FLAGS.SHOW_CURRENT]),
      outerUserEmail: await readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "--get", "user.email"]),
      outerUserName: await readGit(outerRoot, [GIT_TEST_SUBCOMMANDS.CONFIG, "--get", "user.name"]),
    };
  });
}

/** Observes the policy for a branch whose baseline manifest is not a JSON object. */
export function observePolicyWithCorruptBaseline(debtCase: LintPolicyDebtCase): Promise<LintPolicyResult> {
  return withPolicyProject(async (productDir) => {
    const testDebtManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_LINT_DEBT_NODES;
    const testOwnedConstantManifest = VALIDATION_LINT_POLICY_DATA.manifests.TEST_OWNED_CONSTANT_DEBT_NODES;

    await initializePolicyRepository(productDir, VALIDATION_LINT_POLICY_DATA.baseRefs.LOCAL_MAIN);
    await mkdir(join(productDir, debtCase.baseDebtPath), { recursive: true });
    await writeFile(join(productDir, testDebtManifest.file), JSON.stringify([], null, 2));
    await writeFile(
      join(productDir, testOwnedConstantManifest.file),
      JSON.stringify({ [testOwnedConstantManifest.key]: [] }, null, 2),
    );
    await commitAll(productDir, VALIDATION_LINT_POLICY_DATA.commitMessages.corruptBaseline);

    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, "-b", VALIDATION_LINT_POLICY_DATA.testBranch]);
    await writePolicyManifest(productDir, {
      testLintDebtNodes: [debtCase.baseDebtPath],
    });

    return validatePolicy(productDir, debtCase.line);
  });
}

export interface LintPolicyProductOptions {
  /** The methodology line the product's configuration declares; the product is undeclared when absent. */
  readonly declaredLine?: SpecTreeMethodologyLine;
  /** The node directory names, relative to the spec-tree root, the product holds; the product has no spec tree when empty. */
  readonly nodeDirectories: readonly string[];
}

/**
 * Builds a temporary product from the options, runs the lint policy against it, and returns the policy's
 * result as an observation; the caller decides what the result means.
 */
export function observeLintPolicyOfProduct(options: LintPolicyProductOptions): Promise<LintPolicyResult> {
  const config = options.declaredLine === undefined
    ? {}
    : { [METHODOLOGY_SECTION]: { [METHODOLOGY_CONFIG_FIELDS.VERSION]: options.declaredLine } };
  return withTestEnv(config, async (env) => {
    for (const directory of options.nodeDirectories) {
      await writeOrderedDirectory(env, directory);
    }
    return validateLintPolicy(env.productDir);
  });
}
