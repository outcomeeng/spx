import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import { CONFIG_FILE_FORMAT, configFileForFormat, parseConfigFileSections } from "@/config/index";
import type { Config } from "@/config/types";
import { CONFIG_CLI } from "@/interfaces/cli/config";
import { SPX_COMMANDER_PARSE_SOURCE, SPX_GLOBAL_OPTIONS } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { TESTING_SECTION, type TestingConfig } from "@/test/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

type CliRun = {
  readonly exitCodes: readonly number[];
  readonly stderr: string;
  readonly stdout: string;
};

class CliRunExit extends Error {
  constructor(readonly exitCode: number) {
    super();
  }
}

const tempDirs: string[] = [];

afterEach(async () => {
  for (const tempDir of tempDirs.splice(0)) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), sampleConfigTestValue(CONFIG_TEST_GENERATOR.tempPrefix())));
  tempDirs.push(tempDir);
  return tempDir;
}

async function runCli(args: readonly string[], processCwd: string): Promise<CliRun> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const program: Command = createCliProgram({
    processCwd: () => processCwd,
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

describe("product context compliance", () => {
  it("resolves config from -C target instead of a dirty unrelated caller worktree", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.testingConfig());
    const dirtyFilename = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const dirtyContent = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const callerDir = await makeTempDir();
    await runGit(callerDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    await writeFile(join(callerDir, dirtyFilename), dirtyContent);

    await withTestEnv(generated.config, async ({ productDir }) => {
      await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);

      const result = await runCli(
        [
          SPX_GLOBAL_OPTIONS.directory.short,
          productDir,
          CONFIG_CLI.commandName,
          CONFIG_CLI.commands.show,
          CONFIG_CLI.flags.json,
        ],
        callerDir,
      );

      expect(result.exitCodes).toEqual([0]);
      expect(result.stderr).toHaveLength(0);
      expect(testingConfig(parseJsonConfig(result.stdout, productDir))).toEqual(generated.expected);
    });
  });
});
