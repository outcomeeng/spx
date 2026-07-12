import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TYPESCRIPT_VALIDATION_MESSAGES } from "@/commands/validation/typescript";
import { DEFAULT_CONFIG } from "@/config/defaults";
import { resolveProductDir } from "@/domains/config/root";
import { SESSION_STATUSES } from "@/domains/session/types";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { SESSION_CLI } from "@/interfaces/cli/session";
import { validationCliDefinition, validationCommonCliOptions } from "@/interfaces/cli/validation-contract";
import { NOT_GIT_REPO_WARNING } from "@/lib/git/root";
import { sessionsScopeDir } from "@/lib/state-store";
import { TSCONFIG_FILES } from "@/validation/config/scope";
import { VALIDATION_SCOPES } from "@/validation/types";
import {
  CONFIG_TEST_GENERATOR,
  type GeneratedResolutionScope,
  sampleConfigTestValue,
  sampleConfigTestValues,
} from "@testing/generators/config/descriptors";
import { sampleSessionId } from "@testing/generators/session/session";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import {
  parseProductContextJsonConfig,
  ProductContextTempDirs,
  productContextTestingConfig,
  runProductContextCli,
} from "@testing/harnesses/product-context/cli";
import { createSessionHarness } from "@testing/harnesses/session/harness";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const tempDirs = new ProductContextTempDirs();
const cleanupTasks: Array<() => Promise<void>> = [];
const PRODUCT_CONTEXT_MAPPING_CASE_COUNT = 3;
const resolutionScopes = sampleConfigTestValues(
  CONFIG_TEST_GENERATOR.resolutionScope(),
  PRODUCT_CONTEXT_MAPPING_CASE_COUNT,
);

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
    it.each(resolutionScopes)(
      "maps -C to the same resolved config from $nestedDirectory",
      (scope) => assertRedirectedConfigMatchesDirectInvocation(scope),
    );
    it.each(resolutionScopes)(
      "maps -C to the same validation result from $nestedDirectory",
      (scope) => assertRedirectedValidationMatchesDirectInvocation(scope),
    );
    it.each(resolutionScopes)(
      "maps -C to the same session list from caller $nestedDirectory",
      (scope) => assertRedirectedSessionListMatchesDirectInvocation(scope),
    );
    it.each(resolutionScopes)(
      "maps absent -C from process directory $nestedDirectory and preserves the non-git fallback warning",
      (scope) => assertAbsentDirectoryUsesProcessDirectory(scope),
    );
    it("captures deferred exit codes from product-context commands", () => assertDeferredExitCodeIsCaptured());
  });
}

async function assertRedirectedConfigMatchesDirectInvocation(scope: GeneratedResolutionScope): Promise<void> {
  const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.testingConfig());
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

async function assertRedirectedValidationMatchesDirectInvocation(scope: GeneratedResolutionScope): Promise<void> {
  const callerDir = await tempDirs.makeTempDir();
  const productDir = await tempDirs.makeTempDir();
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
  await mkdir(join(productDir, "src"), { recursive: true });
  await writeFile(
    join(productDir, TSCONFIG_FILES.full),
    JSON.stringify({
      compilerOptions: { noEmit: true, strict: true },
      include: ["src/**/*.ts"],
    }),
  );
  await writeFile(join(productDir, "src/index.ts"), "export const productContextValue: string = 'valid';\n");
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
  expect(redirected.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.SUCCESS);
}

async function assertRedirectedSessionListMatchesDirectInvocation(scope: GeneratedResolutionScope): Promise<void> {
  const sessionEnv = await createSessionHarness();
  cleanupTasks.push(sessionEnv.cleanup);
  const productDir = await tempDirs.makeTempDir();
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
  const nestedProductDir = join(productDir, scope.nestedDirectory);
  await mkdir(nestedProductDir, { recursive: true });
  const callerRoot = await tempDirs.makeTempDir();
  const callerDir = join(callerRoot, scope.nestedDirectory);
  await mkdir(callerDir, { recursive: true });
  const sessionId = sampleSessionId();
  const sessionFile = await sessionEnv.writeSession(SESSION_STATUSES[0], sessionId);
  const sharedStatusDir = join(
    sessionsScopeDir(productDir),
    DEFAULT_CONFIG.sessions.statusDirs[SESSION_STATUSES[0]],
  );
  await mkdir(sharedStatusDir, { recursive: true });
  await copyFile(sessionFile, join(sharedStatusDir, basename(sessionFile)));

  const direct = await runProductContextCli(sessionListJsonArgs(), { processCwd: nestedProductDir });
  const redirected = await runProductContextCli(
    [SPX_GLOBAL_OPTIONS.directory.short, nestedProductDir, ...sessionListJsonArgs()],
    { processCwd: callerDir },
  );

  expect(redirected).toEqual(direct);
  expect(redirected.exitCodes).toEqual([]);
  expect(redirected.stdout).toContain(sessionId);
  expect(redirected.stderr).not.toContain(NOT_GIT_REPO_WARNING);
}

async function assertAbsentDirectoryUsesProcessDirectory(scope: GeneratedResolutionScope): Promise<void> {
  const processRoot = await tempDirs.makeTempDir();
  const processDir = join(processRoot, scope.nestedDirectory);
  await mkdir(processDir, { recursive: true });
  const expectedWarning = resolveProductDir(processDir, { readGitToplevel: () => undefined }).warning;
  if (expectedWarning === undefined) throw new Error("non-git product directory must produce a warning");
  const result = await runProductContextCli(
    [CONFIG_CLI.commandName, CONFIG_CLI.commands.validate],
    { processCwd: processDir },
  );

  expect(result.exitCodes).toEqual([0]);
  expect(result.stdout).toContain(processDir);
  expect(result.stderr).toContain(processDir);
  expect(result.stderr).toContain(expectedWarning);
}

async function assertDeferredExitCodeIsCaptured(): Promise<void> {
  const processDir = await tempDirs.makeTempDir();
  const result = await runProductContextCli(
    [DIAGNOSE_CLI.COMMAND, DIAGNOSE_CLI.JSON_FLAG],
    { processCwd: processDir },
  );

  expect(result.exitCodes).toHaveLength(1);
  expect(JSON.parse(result.stdout) as { readonly overall?: unknown }).toHaveProperty("overall");
}
