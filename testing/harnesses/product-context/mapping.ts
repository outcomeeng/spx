import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TYPESCRIPT_VALIDATION_MESSAGES } from "@/commands/validation/typescript";
import { DIAGNOSE_FORMAT } from "@/domains/diagnose/report";
import { SESSION_STATUSES } from "@/domains/session/types";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { SESSION_CLI } from "@/interfaces/cli/session";
import { validationCliDefinition, validationCommonCliOptions } from "@/interfaces/cli/validation-contract";
import { NOT_GIT_REPO_WARNING } from "@/lib/git/root";
import { VALIDATION_SCOPES } from "@/validation/types";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { sampleSessionId } from "@testing/generators/session/session";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import {
  parseProductContextJsonConfig,
  ProductContextTempDirs,
  productContextTestingConfig,
  runProductContextCli,
} from "@testing/harnesses/product-context/cli";
import { createNonGitSessionEnv } from "@testing/harnesses/session/harness";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const tempDirs = new ProductContextTempDirs();
const cleanupTasks: Array<() => Promise<void>> = [];

function configShowJsonArgs(): readonly string[] {
  return [
    CONFIG_CLI.commandName,
    CONFIG_CLI.commands.show,
    CONFIG_CLI.flags.json,
  ];
}

function sessionListJsonArgs(): readonly string[] {
  return [
    SESSION_CLI.commandName,
    SESSION_CLI.commands.list,
    SESSION_CLI.flags.json,
  ];
}

export function registerProductContextMappingEvidence(): void {
  afterEach(async () => {
    for (const cleanup of cleanupTasks.splice(0)) await cleanup();
    await tempDirs.cleanup();
  });

  describe("product context mapping", () => {
    it("maps -C to the same resolved config as invoking from the target directory", () =>
      assertRedirectedConfigMatchesDirectInvocation());
    it("maps -C to the same validation result as invoking from the target directory", () =>
      assertRedirectedValidationMatchesDirectInvocation());
    it("maps -C to the same session list as invoking from the target directory", () =>
      assertRedirectedSessionListMatchesDirectInvocation());
    it("maps absent -C from the process directory and preserves the non-git fallback warning", () =>
      assertAbsentDirectoryUsesProcessDirectory());
    it("captures deferred exit codes from product-context commands", () => assertDeferredExitCodeIsCaptured());
  });
}

async function assertRedirectedConfigMatchesDirectInvocation(): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.testingConfig());
  const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.resolutionScope());
  const callerDir = await tempDirs.makeTempDir();

  await withTestEnv(generated.config, async ({ productDir }) => {
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    const nestedProductDir = join(productDir, scope.nestedDirectory);
    await mkdir(nestedProductDir, { recursive: true });

    const direct = await runProductContextCli(configShowJsonArgs(), { processCwd: nestedProductDir });
    const redirected = await runProductContextCli(
      [SPX_GLOBAL_OPTIONS.directory.short, nestedProductDir, ...configShowJsonArgs()],
      { processCwd: callerDir },
    );

    expect(redirected.exitCodes).toEqual(direct.exitCodes);
    expect(redirected.stderr).toBe(direct.stderr);
    expect(parseProductContextJsonConfig(redirected.stdout, productDir)).toEqual(
      parseProductContextJsonConfig(direct.stdout, productDir),
    );
    expect(productContextTestingConfig(parseProductContextJsonConfig(redirected.stdout, productDir))).toEqual(
      generated.expected,
    );
  });
}

async function assertRedirectedValidationMatchesDirectInvocation(): Promise<void> {
  const callerDir = await tempDirs.makeTempDir();
  const productDir = await tempDirs.makeTempDir();
  const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.resolutionScope());
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
  const nestedProductDir = join(productDir, scope.nestedDirectory);
  await mkdir(nestedProductDir, { recursive: true });

  const validationArgs = [
    validationCliDefinition.domain.commandName,
    validationCliDefinition.subcommands.typescript.commandName,
    validationCommonCliOptions.scope.flag,
    VALIDATION_SCOPES.FULL,
  ] as const;
  const direct = await runProductContextCli(validationArgs, { processCwd: nestedProductDir });
  const redirected = await runProductContextCli(
    [SPX_GLOBAL_OPTIONS.directory.short, nestedProductDir, ...validationArgs],
    { processCwd: callerDir },
  );

  expect(redirected).toEqual(direct);
  expect(redirected.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
}

async function assertRedirectedSessionListMatchesDirectInvocation(): Promise<void> {
  const sessionEnv = await createNonGitSessionEnv();
  cleanupTasks.push(sessionEnv.cleanup);
  const callerDir = await tempDirs.makeTempDir();
  const sessionId = sampleSessionId();
  await sessionEnv.writeSession(SESSION_STATUSES[0], sessionId);

  const direct = await runProductContextCli(sessionListJsonArgs(), { processCwd: sessionEnv.cwd });
  const redirected = await runProductContextCli(
    [SPX_GLOBAL_OPTIONS.directory.short, sessionEnv.cwd, ...sessionListJsonArgs()],
    { processCwd: callerDir },
  );

  expect(redirected).toEqual(direct);
  expect(redirected.exitCodes).toEqual([]);
  expect(redirected.stdout).toContain(sessionId);
  expect(redirected.stderr).toContain(NOT_GIT_REPO_WARNING);
}

async function assertAbsentDirectoryUsesProcessDirectory(): Promise<void> {
  const processDir = await tempDirs.makeTempDir();
  const result = await runProductContextCli(
    [CONFIG_CLI.commandName, CONFIG_CLI.commands.validate],
    { processCwd: processDir },
  );

  expect(result.exitCodes).toEqual([0]);
  expect(result.stdout).toContain(processDir);
  expect(result.stderr).toContain(processDir);
}

async function assertDeferredExitCodeIsCaptured(): Promise<void> {
  const processDir = await tempDirs.makeTempDir();
  const result = await runProductContextCli(
    [DIAGNOSE_CLI.COMMAND, DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON],
    { processCwd: processDir },
  );

  expect(result.exitCodes).toHaveLength(1);
  expect(JSON.parse(result.stdout) as { readonly overall?: unknown }).toHaveProperty("overall");
}
