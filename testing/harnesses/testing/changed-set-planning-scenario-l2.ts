import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { currentStalenessInputs } from "@/commands/test/run-command";
import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { SOURCE_CLI_INVOCATION } from "@/interfaces/cli/invocation";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/test-agent-output";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { extractStalenessInputs, isStalenessMatch, TEST_RUN_STATE_STATUS, type TestRunState } from "@/test/run-state";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import {
  CHANGED_SET_PLANNING_GENERATOR,
  changedSetPassingTestFixture,
  changedSetSelectedTestFixture,
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
  const statePath = stateLine?.slice(prefix.length) ?? "";
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

export function registerChangedSetPlanningScenarioL2Tests(): void {
  describe("changed-set planning command path", () => {
    it("runs only tests affected by the branch diff and records fresh evidence", async () => {
      const paths = sampleChangedSetPlanningValue(CHANGED_SET_PLANNING_GENERATOR.fixturePaths());

      await withTestingTempProductDir(async (productDir) => {
        const [packageJsonPath] = typescriptTestingLanguage.productInputPaths;
        const tsconfigPath = TYPESCRIPT_MARKER;
        await writeFileFixture(productDir, packageJsonPath, changedSetContent.packageJson);
        await writeFileFixture(productDir, tsconfigPath, changedSetContent.tsconfigJson);
        const selectedTestContent = changedSetSelectedTestFixture(
          importPath(paths.selectedTestPath, paths.sourcePath),
          changedSetContent.afterSourceValue,
        );
        await writeFileFixture(productDir, paths.selectedTestPath, selectedTestContent);
        await writeFileFixture(
          productDir,
          paths.untouchedTestPath,
          changedSetPassingTestFixture(),
        );
        await writeFileFixture(
          productDir,
          paths.sourcePath,
          changedSetSourceFixture(changedSetContent.beforeSourceValue),
        );

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
        await execa(
          GIT_TEST_COMMAND,
          [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, changedSetContent.baseCommitMessage],
          { cwd: productDir },
        );
        const baseSha = (
          await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_ROOT_COMMAND.HEAD], { cwd: productDir })
        ).stdout.trim();
        await writeFileFixture(
          productDir,
          paths.sourcePath,
          changedSetSourceFixture(changedSetContent.afterSourceValue),
        );
        await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.ADD, paths.sourcePath], { cwd: productDir });
        await execa(
          GIT_TEST_COMMAND,
          [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, changedSetContent.branchCommitMessage],
          { cwd: productDir },
        );
        const branchHeadSha = (
          await execa(GIT_TEST_COMMAND, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_ROOT_COMMAND.HEAD], { cwd: productDir })
        ).stdout.trim();

        const [sourceCliCommand, sourceCliPath] = SOURCE_CLI_INVOCATION.split(" ") as [string, string];

        const result = await execa(
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
            baseSha,
          ],
          { cwd: process.cwd(), reject: false },
        );

        expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(SUCCESS_EXIT_CODE);
        const recorded = await readRecordedState(result.stdout);
        const coveredPaths = recorded.runnerOutcomes.flatMap((outcome) => outcome.testPaths);
        expect(coveredPaths).toEqual([paths.selectedTestPath]);
        expect(coveredPaths).not.toContain(paths.untouchedTestPath);
        expect(branchHeadSha).not.toBe(baseSha);
        expect(recorded.headSha).toBe(branchHeadSha);
        expect(recorded.status).toBe(TEST_RUN_STATE_STATUS.PASSED);
        const current = await currentStalenessInputs(productDir, coveredPaths, { registry: testingRegistry });
        expect(isStalenessMatch(extractStalenessInputs(recorded), current)).toBe(true);
      });
    });
  });
}
