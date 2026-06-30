import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SIGINT_EXIT_CODE, SIGINT_NAME, SIGTERM_EXIT_CODE, SIGTERM_NAME } from "@/lib/process-lifecycle";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { runSpawnFixture, SPAWN_FIXTURE_UNKNOWN_EXIT_CODE } from "@testing/harnesses/process-lifecycle/spawn-fixture";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

describe("Scenario: spawn fixture result capture", () => {
  it("reports numeric exit status, stderr text, and observed stdout bytes", async () => {
    const stdoutText = createMultibyteStdoutText();
    const stderrText = sampleLiteralTestValue(arbitraryDomainLiteral());
    const evalFlag = "-e";
    const script = [
      "process.stdout.write(process.argv[1]);",
      "process.stderr.write(process.argv[2]);",
      "process.exit(Number(process.argv[3]));",
    ].join("");

    const result = await runSpawnFixture({
      command: process.execPath,
      args: [evalFlag, script, stdoutText, stderrText, String(SIGINT_EXIT_CODE)],
      cwd: process.cwd(),
    });

    expect(result.exitCode).toBe(SIGINT_EXIT_CODE);
    expect(result.stderr).toBe(stderrText);
    expect(result.stdoutBytesObserved).toBe(Buffer.byteLength(stdoutText));
  });

  it("maps SIGTERM child termination to the conventional exit code", async () => {
    const evalFlag = "-e";
    const script = "process.kill(process.pid, process.argv[1]);";

    const result = await runSpawnFixture({
      command: process.execPath,
      args: [evalFlag, script, SIGTERM_NAME],
      cwd: process.cwd(),
    });

    expect(result.exitCode).toBe(SIGTERM_EXIT_CODE);
  });

  it("maps another standard signal through Node's signal table", async () => {
    const evalFlag = "-e";
    const script = "process.kill(process.pid, process.argv[1]);";

    const result = await runSpawnFixture({
      command: process.execPath,
      args: [evalFlag, script, SIGINT_NAME],
      cwd: process.cwd(),
    });

    expect(result.exitCode).toBe(SIGINT_EXIT_CODE);
  });

  it("settles spawn errors with the source-owned unknown exit code", async () => {
    const missingCommandName = sampleLiteralTestValue(arbitraryDomainLiteral());

    await withTempDir(missingCommandName, async (tempDir) => {
      const result = await runSpawnFixture({
        command: join(tempDir, missingCommandName),
        args: [],
        cwd: tempDir,
      });

      expect(result.exitCode).toBe(SPAWN_FIXTURE_UNKNOWN_EXIT_CODE);
    });
  });
});

function createMultibyteStdoutText(): string {
  const asciiPrefix = sampleLiteralTestValue(arbitraryDomainLiteral());
  const multibyteCodePoint = 0x111;
  return `${asciiPrefix}${String.fromCodePoint(multibyteCodePoint)}`;
}
