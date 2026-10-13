import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatValidationPathsNoTargetsSkipMessage,
  VALIDATION_EXIT_CODES,
  VALIDATION_STAGE_DISPLAY_NAMES,
} from "@/commands/validation/messages";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import {
  VALIDATION_PATH_TOOL_SUBSECTIONS,
  VALIDATION_PATHS_SUBSECTION,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { ESLINT_PRODUCTION_CONFIG_FILES } from "@/validation/discovery";
import { LINT_POLICY_MANIFESTS } from "@/validation/lint-policy-constants";
import { buildEslintArgs } from "@/validation/steps/eslint";
import { DEFAULT_ESLINT_CONFIG_FILE, ESLINT_COMMAND_TOKENS } from "@/validation/steps/eslint-contract";
import { EXECUTION_MODES, VALIDATION_SCOPES } from "@/validation/types";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { SPEC_TREE_CASE_TITLE, specTreeConfigForLine } from "@testing/generators/spec-tree/spec-tree";
import { lintPolicyDebtCases } from "@testing/generators/validation/lint-policy";
import { VALIDATION_PIPELINE_DATA } from "@testing/generators/validation/validation";
import {
  LINT_ESLINT_STUB,
  observeConsecutiveLintInvocations,
  observeEslintOutputForwarding,
  observeLintCommandOnProduct,
  observeLintWithReportedProductionConfig,
} from "@testing/harnesses/validation/lint-args-compliance";

describe("ESLint command arguments", () => {
  it("passes product lint through without injected policy arguments", () => {
    const args = buildEslintArgs({ scope: VALIDATION_SCOPES.FULL });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("passes scoped file lint through without injected policy arguments", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());

    const args = buildEslintArgs({ scope: VALIDATION_SCOPES.FULL, validatedFiles: [validatedFile] });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("lets explicit file scope take precedence over production scope", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());

    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
      },
      validatedFiles: [validatedFile],
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("passes fix mode through when explicit file scope is supplied", () => {
    const validatedFile = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());

    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.FULL,
      mode: EXECUTION_MODES.WRITE,
      validatedFiles: [validatedFile],
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FIX_FLAG,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      validatedFile,
    ]);
  });

  it("passes fix mode through as the only optional ESLint behavior flag", () => {
    const args = buildEslintArgs({ scope: VALIDATION_SCOPES.FULL, mode: EXECUTION_MODES.WRITE });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FIX_FLAG,
    ]);
  });

  it("passes production scope patterns as ESLint targets without process environment state", () => {
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filePatterns: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
      },
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
      ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
      VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("uses ESLint current-directory target for implicit TypeScript include scope", () => {
    const args = buildEslintArgs({
      scope: VALIDATION_SCOPES.PRODUCTION,
      scopeConfig: {
        directories: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
        excludePatterns: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
        filePatterns: [],
      },
    });

    expect(args).toStrictEqual([
      ESLINT_COMMAND_TOKENS.COMMAND,
      ESLINT_COMMAND_TOKENS.CURRENT_DIRECTORY,
      ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
      VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });
});

describe("ESLint binary spawned by the lint command", () => {
  it("runs the lint command from the requested product root", async () => {
    const observation = await observeLintCommandOnProduct({
      files: [
        { path: TSCONFIG_FILES.full, json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] } },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
      ],
      stub: LINT_ESLINT_STUB.WORKING_DIRECTORY,
      command: () => ({ quiet: true }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedWorkingDirectory).toBe(observation.productRealPath);
  });

  it("passes production ESLint ignore patterns to the spawned binary", async () => {
    const observation = await observeLintCommandOnProduct({
      files: [
        { path: TSCONFIG_FILES.full, json: { include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] } },
        {
          path: TSCONFIG_FILES.production,
          json: {
            include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern],
            exclude: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
          },
        },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
        { path: join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName) },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: () => ({ scope: VALIDATION_SCOPES.PRODUCTION, quiet: true }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedArguments).toStrictEqual([
      VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
      ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
      VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("uses the production ESLint config when production scope supplies one", async () => {
    const observation = await observeLintCommandOnProduct({
      files: [
        { path: TSCONFIG_FILES.full, json: { include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] } },
        { path: TSCONFIG_FILES.production, json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] } },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
        { path: ESLINT_PRODUCTION_CONFIG_FILES[0] },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: () => ({ scope: VALIDATION_SCOPES.PRODUCTION, quiet: true }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedArguments).toContain(ESLINT_PRODUCTION_CONFIG_FILES[0]);
  });

  it("uses a production-only ESLint config for production scope", async () => {
    const observation = await observeLintCommandOnProduct({
      files: [
        { path: TSCONFIG_FILES.full, json: { include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] } },
        { path: TSCONFIG_FILES.production, json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] } },
        { path: ESLINT_PRODUCTION_CONFIG_FILES[0] },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: () => ({ scope: VALIDATION_SCOPES.PRODUCTION, quiet: true }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedArguments).toContain(ESLINT_PRODUCTION_CONFIG_FILES[0]);
  });

  it("passes ESLint-specific validation paths to the spawned binary", async () => {
    const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());

    const observation = await observeLintCommandOnProduct({
      config: {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            [VALIDATION_PATH_TOOL_SUBSECTIONS.ESLINT]: {
              include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
              exclude: [VALIDATION_PIPELINE_DATA.productionScopeExcludePattern],
            },
          },
        },
      },
      files: [
        {
          path: TSCONFIG_FILES.full,
          json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern, testFilePath] },
        },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
        { path: sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()) },
        { path: testFilePath },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: () => ({ quiet: true }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedArguments).toStrictEqual([
      VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
      ESLINT_COMMAND_TOKENS.IGNORE_PATTERN_FLAG,
      VALIDATION_PIPELINE_DATA.productionScopeExcludePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("skips ESLint when validation path includes have no intersection", async () => {
    const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());

    const observation = await observeLintCommandOnProduct({
      config: {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            [VALIDATION_PATH_TOOL_SUBSECTIONS.ESLINT]: { include: [testFilePath] },
          },
        },
      },
      files: [
        {
          path: TSCONFIG_FILES.full,
          json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern, testFilePath] },
        },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
        { path: sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()) },
        { path: testFilePath },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: () => ({}),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.output).toBe(formatValidationPathsNoTargetsSkipMessage(VALIDATION_STAGE_DISPLAY_NAMES.ESLINT));
    expect(observation.recordedArguments).toBeUndefined();
  });

  it("preserves explicit ESLint file scope through validation paths", async () => {
    const testFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());

    const observation = await observeLintCommandOnProduct({
      config: {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: { include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] },
        },
      },
      files: [
        {
          path: TSCONFIG_FILES.full,
          json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern, testFilePath] },
        },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
        { path: sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath()) },
        { path: testFilePath },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: () => ({ files: [testFilePath] }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedArguments).toStrictEqual([
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      testFilePath,
    ]);
  });

  it("preserves explicit ESLint root directory operands through validation paths", async () => {
    const observation = await observeLintCommandOnProduct({
      config: {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName],
            exclude: [
              `${VALIDATION_PIPELINE_DATA.sourceDirectoryName}/${VALIDATION_PIPELINE_DATA.excludedSourceDirectoryName}`,
            ],
          },
        },
      },
      files: [
        { path: TSCONFIG_FILES.full, json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] } },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
        { path: join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName) },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: () => ({ files: ["."], quiet: true }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedArguments).toStrictEqual([
      VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("does not widen explicit ESLint directory operands to every validation include", async () => {
    const observation = await observeLintCommandOnProduct({
      config: {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: {
            include: [
              VALIDATION_PIPELINE_DATA.sourceDirectoryName,
              VALIDATION_PIPELINE_DATA.secondarySourceDirectoryName,
            ],
            exclude: [
              `${VALIDATION_PIPELINE_DATA.sourceDirectoryName}/${VALIDATION_PIPELINE_DATA.excludedSourceDirectoryName}`,
            ],
          },
        },
      },
      files: [
        {
          path: TSCONFIG_FILES.full,
          json: {
            include: [
              VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
              `${VALIDATION_PIPELINE_DATA.secondarySourceDirectoryName}/**/*.ts`,
            ],
          },
        },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
        { path: join(VALIDATION_PIPELINE_DATA.sourceDirectoryName, VALIDATION_PIPELINE_DATA.cleanSourceFileName) },
        {
          path: join(
            VALIDATION_PIPELINE_DATA.secondarySourceDirectoryName,
            VALIDATION_PIPELINE_DATA.secondarySourceFileName,
          ),
        },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: () => ({ files: [VALIDATION_PIPELINE_DATA.sourceDirectoryName], quiet: true }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedArguments).toStrictEqual([
      VALIDATION_PIPELINE_DATA.productionScopeFilePattern,
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
    ]);
  });

  it("normalizes absolute ESLint file scope before validation path filtering", async () => {
    const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());

    const observation = await observeLintCommandOnProduct({
      config: {
        [validationConfigDescriptor.section]: {
          [VALIDATION_PATHS_SUBSECTION]: { include: [VALIDATION_PIPELINE_DATA.sourceDirectoryName] },
        },
      },
      files: [
        { path: TSCONFIG_FILES.full, json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] } },
        { path: DEFAULT_ESLINT_CONFIG_FILE },
        { path: sourceFilePath },
      ],
      stub: LINT_ESLINT_STUB.ARGUMENTS,
      command: (productDir) => ({ files: [join(productDir, sourceFilePath)] }),
    });

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.recordedArguments).toStrictEqual([
      ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
      DEFAULT_ESLINT_CONFIG_FILE,
      ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
      sourceFilePath,
    ]);
  });

  it.each(lintPolicyDebtCases())(
    `injects no repository lint-policy arguments into a product that lists a spec-tree node in both debt manifests, ${SPEC_TREE_CASE_TITLE}`,
    async (debtCase) => {
      const sourceFilePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());

      const observation = await observeLintCommandOnProduct({
        config: specTreeConfigForLine(debtCase.line),
        nodeDirectories: [debtCase.baseDebtPath.slice(`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`.length)],
        files: [
          { path: TSCONFIG_FILES.full, json: { include: [VALIDATION_PIPELINE_DATA.productionScopeFilePattern] } },
          { path: DEFAULT_ESLINT_CONFIG_FILE },
          {
            path: LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.file,
            json: { [LINT_POLICY_MANIFESTS.TEST_LINT_DEBT_NODES.key]: [debtCase.baseDebtPath] },
          },
          {
            path: LINT_POLICY_MANIFESTS.TEST_OWNED_CONSTANT_DEBT_NODES.file,
            json: { [LINT_POLICY_MANIFESTS.TEST_OWNED_CONSTANT_DEBT_NODES.key]: [debtCase.baseDebtPath] },
          },
          { path: sourceFilePath },
        ],
        stub: LINT_ESLINT_STUB.ARGUMENTS,
        command: () => ({ files: [sourceFilePath], fix: true, quiet: true }),
      });

      expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
      expect(observation.recordedArguments).toStrictEqual([
        ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
        DEFAULT_ESLINT_CONFIG_FILE,
        ESLINT_COMMAND_TOKENS.FIX_FLAG,
        ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
        sourceFilePath,
      ]);
    },
  );

  it("forwards ESLint subprocess output through injected parent streams", async () => {
    const stdoutChunk = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.domainLiteral());

    const observation = await observeEslintOutputForwarding(stdoutChunk);

    expect(observation.success).toBe(true);
    expect(observation.stdoutChunks).toStrictEqual([stdoutChunk]);
    expect(observation.stderrChunks).toStrictEqual([]);
  });

  it("uses the production ESLint config reported by language detection", async () => {
    const observation = await observeLintWithReportedProductionConfig();

    expect(observation.exitCode).toBe(VALIDATION_EXIT_CODES.SUCCESS);
    expect(observation.receivedEslintConfigFile).toBe(ESLINT_PRODUCTION_CONFIG_FILES[0]);
  });

  it("spawns the discovered executable with the reported config and caller file, and returns each invocation's own result", async () => {
    const observation = await observeConsecutiveLintInvocations();

    expect(observation.spawnedCommands).toStrictEqual([
      observation.discoveredToolPath,
      observation.discoveredToolPath,
    ]);
    expect(observation.spawnedArguments).toStrictEqual([
      [
        ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
        observation.reportedConfigFile,
        ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
        observation.callerFile,
      ],
      [
        ESLINT_COMMAND_TOKENS.CONFIG_FLAG,
        observation.reportedConfigFile,
        ESLINT_COMMAND_TOKENS.FILE_SEPARATOR,
        observation.callerFile,
      ],
    ]);
    expect(observation.exitCodes).toStrictEqual(observation.childCloseCodes);
    expect(observation.childCloseCodes[0]).not.toBe(observation.childCloseCodes[1]);
  });
});
