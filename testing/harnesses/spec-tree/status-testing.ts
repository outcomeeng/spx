import { Writable } from "node:stream";
import { expect } from "vitest";

import { createRunnerDepsFor } from "@/interfaces/cli/test-runner-deps";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

const NODE_EVAL_ARGUMENT = "-e";

function stdoutWriterScript(marker: string): string {
  return `process.stdout.write(${JSON.stringify(marker)})`;
}

export async function assertStatusTestRunnerForwardsStdout(productDir: string): Promise<void> {
  const captured: Buffer[] = [];
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      captured.push(Buffer.from(chunk));
      done();
    },
  });
  const marker = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
  const runnerDeps = createRunnerDepsFor(productDir, sink)(typescriptTestingLanguage);
  const result = await runnerDeps.runCommand(process.execPath, [NODE_EVAL_ARGUMENT, stdoutWriterScript(marker)]);

  expect(result.exitCode).toBe(0);
  expect(Buffer.concat(captured).toString()).toContain(marker);
}
