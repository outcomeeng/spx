import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { TYPESCRIPT_VALIDATION_MESSAGES } from "@/commands/validation/typescript";
import { CONFIG_FILE_FORMAT, configFileForFormat, parseConfigFileSections } from "@/config/index";
import type { Config } from "@/config/types";
import { SESSION_STATUSES } from "@/domains/session/types";
import { NOT_GIT_REPO_WARNING } from "@/git/root";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SPX_COMMANDER_PARSE_SOURCE, SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { SESSION_CLI } from "@/interfaces/cli/session";
import { validationCliDefinition, validationCommonCliOptions } from "@/interfaces/cli/validation";
import { TESTING_SECTION, type TestingConfig } from "@/test/config";
import { VALIDATION_SCOPES } from "@/validation/types";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { sampleSessionId } from "@testing/generators/session/session";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { createNonGitSessionEnv } from "@testing/harnesses/session/harness";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

type CliRun = {
  readonly exitCodes: readonly number[];
  readonly stderr: string;
  readonly stdout: string;
};

type CliRunOptions = {
  readonly processCwd: string;
};

class CliRunExit extends Error {
  constructor(readonly exitCode: number) {
    super();
  }
}

const tempDirs: string[] = [];
const cleanupTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks.splice(0)) {
    await cleanup();
  }
  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
  tempDirs.push(tempDir);
  return tempDir;
}

async function runCli(args: readonly string[], options: CliRunOptions): Promise<CliRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const program: Command = createCliProgram({
    processCwd: () => options.processCwd,
    writeStdout: (output) => stdout.push(output),
    writeStderr: (output) => stderr.push(output),
    exit: (exitCode) => {
      exitCodes.push(exitCode);
      throw new CliRunExit(exitCode);
    },
  });

  try {
    await program.parseAsync(args, { from: SPX_COMMANDER_PARSE_SOURCE });
  } catch (error) {
    if (!(error instanceof CliRunExit)) throw error;
  }

  return {
    exitCodes,
    stderr: stderr.join(""),
    stdout: stdout.join(""),
  };
}

function parseJsonConfig(raw: string, productDir: string): Config {
  const parsed = parseConfigFileSections(
    configFileForFormat(productDir, CONFIG_FILE_FORMAT.JSON, raw),
  );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function testingConfig(config: Config): TestingConfig {
  return config[TESTING_SECTION] as TestingConfig;
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
      expect(parseJsonConfig(redirected.stdout, productDir)).toEqual(parseJsonConfig(direct.stdout, productDir));
      expect(testingConfig(parseJsonConfig(redirected.stdout, productDir))).toEqual(generated.expected);
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
});
