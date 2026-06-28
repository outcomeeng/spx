import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { SUCCESS_EXIT_CODE } from "@/domains/test";
import { GIT_ROOT_COMMAND } from "@/git/root";
import { SOURCE_CLI_INVOCATION } from "@/interfaces/cli/invocation";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/test-agent-output";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import type { TestRunState } from "@/test/run-state";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import {
  GIT_TEST_COMMAND,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
} from "@testing/harnesses/git-test-constants";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";

const packageJson = "{}";
const tsconfigJson = "{}";
const sourceDir = "src";
const sourceFile = "changed.ts";
const posixSeparator = "/";

async function writeFileFixture(productDir: string, path: string, content: string): Promise<void> {
  const absolute = join(productDir, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

function importPath(fromFile: string, toFile: string): string {
  const relativePath = relative(dirname(fromFile), toFile).split(/[/\\]/).join(posixSeparator);
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
    if (line !== undefined && line.length > 0) {
      terminalLine = line;
      break;
    }
  }
  return JSON.parse(terminalLine) as TestRunState;
}

function sourceFixture(value: number): string {
  return [`export const value = ${value};`, ""].join("\n");
}

describe("changed-set planning command path", () => {
  it("runs only tests affected by the branch diff and records fresh evidence", async () => {
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const selectedTestPath = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
    );
    const untouchedTestPath = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(
        typescriptTestingLanguage,
        sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath()),
      ),
    );

    await withTestingTempProductDir(async (productDir) => {
      const [packageJsonPath] = typescriptTestingLanguage.productInputPaths;
      const tsconfigPath = typescriptTestingLanguage.productInputPaths.find((path) => path === TYPESCRIPT_MARKER);
      if (packageJsonPath === undefined || tsconfigPath === undefined) {
        throw new Error("TypeScript product input paths must include package.json and tsconfig.json");
      }
      await writeFileFixture(productDir, packageJsonPath, packageJson);
      await writeFileFixture(productDir, tsconfigPath, tsconfigJson);
      await writeFileFixture(
        productDir,
        selectedTestPath,
        `import { expect, it } from 'vitest'; import { value } from '${
          importPath(selectedTestPath, `${sourceDir}/${sourceFile}`)
        }'; it('passes', () => expect(value).toBe(2));`,
      );
      await writeFileFixture(
        productDir,
        untouchedTestPath,
        "import { expect, it } from 'vitest'; it('passes', () => expect(true).toBe(true));",
      );
      await writeFileFixture(productDir, `${sourceDir}/${sourceFile}`, sourceFixture(1));

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
      await writeFileFixture(productDir, `${sourceDir}/${sourceFile}`, sourceFixture(2));

      const [sourceCliCommand, sourceCliPath] = SOURCE_CLI_INVOCATION.split(" ");
      if (sourceCliCommand === undefined || sourceCliPath === undefined) {
        throw new Error("Source CLI invocation must contain a command and path");
      }

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
          GIT_ROOT_COMMAND.HEAD,
        ],
        { cwd: process.cwd(), reject: false },
      );

      expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(SUCCESS_EXIT_CODE);
      const recorded = await readRecordedState(result.stdout);
      const coveredPaths = recorded.runnerOutcomes.flatMap((outcome) => outcome.testPaths);
      expect(coveredPaths).toContain(selectedTestPath);
      expect(coveredPaths).not.toContain(untouchedTestPath);
    });
  });
});
