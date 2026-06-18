import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/testing-agent-output";
import {
  AGENT_ARTIFACT_DIR_PREFIX,
  AGENT_TEST_OUTPUT_COMMAND,
  AGENT_TEST_OUTPUT_ENV,
  AGENT_TEST_OUTPUT_STREAM_METHOD,
  AGENT_TEST_OUTPUT_TEXT_ENCODING,
  createAgentOutputCommandRunner,
  resolveTestingCommand,
} from "@/interfaces/cli/testing-runner-deps";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  arbitraryDomainLiteral,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

function outputScript(stdoutContent: string, stderrContent: string): string {
  const stdoutWrite = ["process", AGENT_TEST_OUTPUT_TEXT.STDOUT, AGENT_TEST_OUTPUT_STREAM_METHOD].join(".");
  const stderrWrite = ["process", AGENT_TEST_OUTPUT_TEXT.STDERR, AGENT_TEST_OUTPUT_STREAM_METHOD].join(".");
  const cwdRead = ["process", "cwd()"].join(".");
  const envRead = ["process", "env", "CI"].join(".");
  return [
    `${stdoutWrite}(${JSON.stringify(stdoutContent)});`,
    `${stderrWrite}(${JSON.stringify(stderrContent)});`,
    `${stdoutWrite}(${cwdRead});`,
    `${stderrWrite}(${envRead} ?? "");`,
  ].join("");
}

describe("agent test-output runner", () => {
  it("captures stdout and stderr to artifact files while setting CI and cwd", async () => {
    const stdoutContent = sampleLiteralTestValue(arbitraryDomainLiteral());
    const stderrContent = sampleLiteralTestValue(arbitraryDomainLiteral());

    await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
      const runCommand = createAgentOutputCommandRunner(productDir, { tmpDir: productDir, env: {} });
      const result = await runCommand(process.execPath, [
        AGENT_TEST_OUTPUT_COMMAND.NODE_EVAL_ARG,
        outputScript(stdoutContent, stderrContent),
      ]);

      expect(result.output).toBeDefined();
      if (result.output === undefined) throw new Error();
      expect(await readFile(result.output.stdoutPath, AGENT_TEST_OUTPUT_TEXT_ENCODING)).toBe(
        `${stdoutContent}${await realpath(productDir)}`,
      );
      expect(await readFile(result.output.stderrPath, AGENT_TEST_OUTPUT_TEXT_ENCODING)).toBe(
        `${stderrContent}${AGENT_TEST_OUTPUT_ENV.CI}`,
      );
    });
  });

  it("resolves pnpm exec vitest to the product-local vitest binary in agent mode", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFilePath());

    const resolved = resolveTestingCommand(productDir, AGENT_TEST_OUTPUT_COMMAND.PACKAGE_MANAGER, [
      AGENT_TEST_OUTPUT_COMMAND.PACKAGE_MANAGER_EXEC_ARG,
      AGENT_TEST_OUTPUT_COMMAND.VITEST,
      testPath,
    ]);

    expect(resolved.command).toBe(join(
      productDir,
      AGENT_TEST_OUTPUT_COMMAND.LOCAL_BINARY_DIR,
      AGENT_TEST_OUTPUT_COMMAND.VITEST,
    ));
    expect(resolved.args).toEqual([testPath]);
  });
});
