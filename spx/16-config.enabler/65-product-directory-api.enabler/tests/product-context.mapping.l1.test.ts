import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TYPESCRIPT_VALIDATION_MESSAGES } from "@/commands/validation/typescript";
import { DIAGNOSE_FORMAT } from "@/domains/diagnose/report";
import { SESSION_STATUSES } from "@/domains/session/types";
import { NOT_GIT_REPO_WARNING } from "@/git/root";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { SESSION_CLI } from "@/interfaces/cli/session";
import { validationCliDefinition, validationCommonCliOptions } from "@/interfaces/cli/validation-contract";
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

afterEach(async () => {
  for (const cleanup of cleanupTasks.splice(0)) {
    await cleanup();
  }
  await tempDirs.cleanup();
});

async function makeTempDir(): Promise<string> {
  return tempDirs.makeTempDir();
}

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

describe("product context mapping", () => {
  it("maps -C to the same resolved config as invoking from the target directory", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.testingConfig());
    const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.resolutionScope());
    const callerDir = await makeTempDir();

    await withTestEnv(generated.config, async ({ productDir }) => {
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
      const nestedProductDir = join(productDir, scope.nestedDirectory);
      await mkdir(nestedProductDir, { recursive: true });

      const direct = await runCli(configShowJsonArgs(), { processCwd: nestedProductDir });
      const redirected = await runCli(
        [
          SPX_GLOBAL_OPTIONS.directory.short,
          nestedProductDir,
          ...configShowJsonArgs(),
        ],
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
  });

  it("maps -C to the same validation result as invoking from the target directory", async () => {
    const callerDir = await makeTempDir();
    const productDir = await makeTempDir();
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

    const direct = await runCli(validationArgs, { processCwd: nestedProductDir });
    const redirected = await runCli(
      [
        SPX_GLOBAL_OPTIONS.directory.short,
        nestedProductDir,
        ...validationArgs,
      ],
      { processCwd: callerDir },
    );

    expect(redirected).toEqual(direct);
    expect(redirected.stdout).toContain(TYPESCRIPT_VALIDATION_MESSAGES.ABSENT);
  });

  it("maps -C to the same session list as invoking from the target directory", async () => {
    const sessionEnv = await createNonGitSessionEnv();
    cleanupTasks.push(sessionEnv.cleanup);
    const callerDir = await makeTempDir();
    const sessionId = sampleSessionId();
    await sessionEnv.writeSession(SESSION_STATUSES[0], sessionId);

    const direct = await runCli(sessionListJsonArgs(), { processCwd: sessionEnv.cwd });
    const redirected = await runCli(
      [
        SPX_GLOBAL_OPTIONS.directory.short,
        sessionEnv.cwd,
        ...sessionListJsonArgs(),
      ],
      { processCwd: callerDir },
    );

    expect(redirected).toEqual(direct);
    expect(redirected.exitCodes).toEqual([]);
    expect(redirected.stdout).toContain(sessionId);
    expect(redirected.stderr).toContain(NOT_GIT_REPO_WARNING);
  });

  it("maps absent -C from the process directory and preserves the non-git fallback warning", async () => {
    const processDir = await makeTempDir();

    const result = await runCli(
      [
        CONFIG_CLI.commandName,
        CONFIG_CLI.commands.validate,
      ],
      { processCwd: processDir },
    );

    expect(result.exitCodes).toEqual([0]);
    expect(result.stdout).toContain(processDir);
    expect(result.stderr).toContain(processDir);
  });

  it("captures deferred exit codes from product-context commands", async () => {
    const processDir = await makeTempDir();

    const result = await runCli(
      [
        DIAGNOSE_CLI.COMMAND,
        DIAGNOSE_CLI.FORMAT_FLAG,
        DIAGNOSE_FORMAT.JSON,
      ],
      { processCwd: processDir },
    );

    expect(result.exitCodes).toHaveLength(1);
    const parsed = JSON.parse(result.stdout) as { readonly overall?: unknown };
    expect(parsed.overall).toBeDefined();
  });
});

function runCli(args: readonly string[], options: { readonly processCwd: string }) {
  return runProductContextCli(args, options);
}
