import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { GIT_ROOT_COMMAND } from "@/git/root";
import { SOURCE_CLI_INVOCATION } from "@/interfaces/cli/invocation";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/test-agent-output";
import { compareAsciiStrings } from "@/lib/state-store";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import type { TestRunState } from "@/test/run-state";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import {
  CHANGED_SET_PLANNING_GENERATOR,
  type ChangedSetFixturePaths,
  changedSetSourceFixture,
  sampleChangedSetPlanningValue,
} from "@testing/generators/testing/changed-set-planning";
import {
  GIT_TEST_COMMAND,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
} from "@testing/harnesses/git-test-constants";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";

const changedSetContent = CHANGED_SET_PLANNING_GENERATOR.content();
const TYPESCRIPT_JSX_TEST_SUFFIX = ".test.tsx";
const TYPESCRIPT_TEST_SUFFIX = ".test.ts";

function commandFixturePaths(paths: ChangedSetFixturePaths): ChangedSetFixturePaths {
  return {
    ...paths,
    testPath: paths.testPath.replace(TYPESCRIPT_JSX_TEST_SUFFIX, TYPESCRIPT_TEST_SUFFIX),
    selectedTestPath: paths.selectedTestPath.replace(TYPESCRIPT_JSX_TEST_SUFFIX, TYPESCRIPT_TEST_SUFFIX),
    untouchedTestPath: paths.untouchedTestPath.replace(TYPESCRIPT_JSX_TEST_SUFFIX, TYPESCRIPT_TEST_SUFFIX),
  };
}

async function writeFileFixture(productDir: string, path: string, content: string): Promise<void> {
  const absolute = join(productDir, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

function importPath(fromFile: string, toFile: string): string {
  const relativePath = relative(dirname(fromFile), toFile).split(/[/\\]/).join(changedSetContent.posixSeparator);
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

async function readRecordedState(stdout: string): Promise<TestRunState> {
  const prefix = `${AGENT_TEST_OUTPUT_TEXT.STATE_FILE}: `;
  const stateLine = stdout.split("\n").find((line) => line.startsWith(prefix));
  expect(stateLine).toBeDefined();
  if (stateLine === undefined) {
    throw new Error("test run state output did not include a state file path");
  }
  const statePath = stateLine.slice(prefix.length);
  const raw = (await readFile(statePath)).toString();
  const lines = raw.split("\n");
  let terminalLine = "";
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.length > 0) {
      terminalLine = line;
      break;
    }
  }
  return JSON.parse(terminalLine) as TestRunState;
}

function expectedSha256(value: string): string {
  return createHash(changedSetContent.sha256Algorithm).update(value).digest(changedSetContent.hexEncoding);
}

function expectedCoveredPathsDigest(paths: readonly string[]): string {
  return expectedSha256(JSON.stringify([...new Set(paths)].sort(compareAsciiStrings)));
}

function expectedCoveredContentDigest(path: string, content: string): string {
  return expectedSha256(JSON.stringify([[path, content]]));
}

async function writeChangedSetCommandFixture(productDir: string, paths: ChangedSetFixturePaths): Promise<string> {
  const [packageJsonPath] = typescriptTestingLanguage.productInputPaths;
  const tsconfigPath = TYPESCRIPT_MARKER;
  await writeFileFixture(productDir, packageJsonPath, changedSetContent.packageJson);
  await writeFileFixture(productDir, tsconfigPath, changedSetContent.tsconfigJson);

  const selectedTestContent = `import { expect, it } from 'vitest'; import { value } from '${
    importPath(paths.selectedTestPath, paths.sourcePath)
  }'; it('passes', () => expect(value).toBe(${changedSetContent.afterSourceValue}));`;
  await writeFileFixture(productDir, paths.selectedTestPath, selectedTestContent);
  await writeFileFixture(
    productDir,
    paths.untouchedTestPath,
    "import { expect, it } from 'vitest'; it('passes', () => expect(true).toBe(true));",
  );
  await writeFileFixture(
    productDir,
    paths.sourcePath,
    changedSetSourceFixture(changedSetContent.beforeSourceValue),
  );
  return selectedTestContent;
}

async function initializeChangedSetCommandRepo(productDir: string): Promise<void> {
  await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.INIT], { cwd: productDir });
  await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL], {
    cwd: productDir,
  });
  await execa(
    GIT_TEST_COMMAND,
    [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME],
    { cwd: productDir },
  );
  await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.ADD, "."], { cwd: productDir });
  await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, "base"], {
    cwd: productDir,
  });
}

async function runChangedSetCommand(productDir: string) {
  const [sourceCliCommand, sourceCliPath] = SOURCE_CLI_INVOCATION.split(" ") as [string, string];

  return await execa(
    sourceCliCommand,
    [
      sourceCliPath,
      "-C",
      productDir,
      TESTING_CLI.commandName,
      TESTING_CLI.passingSubcommand,
      TESTING_CLI.agentOption,
      TESTING_CLI.changedLongFlag,
      TESTING_CLI.baseLongFlag,
      GIT_ROOT_COMMAND.HEAD,
    ],
    { cwd: process.cwd(), reject: false },
  );
}

async function expectChangedSetCommandRunsAffectedTests(): Promise<void> {
  const paths = commandFixturePaths(sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths()));

  await withTestingTempProductDir(async (productDir) => {
    const selectedTestContent = await writeChangedSetCommandFixture(productDir, paths);
    await initializeChangedSetCommandRepo(productDir);
    await writeFileFixture(
      productDir,
      paths.sourcePath,
      changedSetSourceFixture(changedSetContent.afterSourceValue),
    );

    const result = await runChangedSetCommand(productDir);

    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(SUCCESS_EXIT_CODE);
    const recorded = await readRecordedState(result.stdout);
    const coveredPaths = recorded.runnerOutcomes.flatMap((outcome) => outcome.testPaths);
    expect(coveredPaths).toEqual([paths.selectedTestPath]);
    expect(coveredPaths).not.toContain(paths.untouchedTestPath);
    expect(recorded.discoveredTestPathsDigest).toBe(expectedCoveredPathsDigest([paths.selectedTestPath]));
    expect(recorded.discoveredTestContentDigest).toBe(
      expectedCoveredContentDigest(paths.selectedTestPath, selectedTestContent),
    );
  });
}

export function registerChangedSetPlanningCommandTests(): void {
  describe("changed-set planning command path", () => {
    it(
      "runs only tests affected by the branch diff and records fresh evidence",
      expectChangedSetCommandRunsAffectedTests,
    );
  });
}
