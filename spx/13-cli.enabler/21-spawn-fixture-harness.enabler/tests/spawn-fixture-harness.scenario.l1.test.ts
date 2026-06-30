import { constants as osConstants } from "node:os";

import { describe, expect, it } from "vitest";

import { SIGINT_EXIT_CODE, SIGTERM_EXIT_CODE, SIGTERM_NAME } from "@/lib/process-lifecycle";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { runSpawnFixture } from "@testing/harnesses/process-lifecycle/spawn-fixture";

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
    const signalName = "SIGUSR2" satisfies NodeJS.Signals;

    const result = await runSpawnFixture({
      command: process.execPath,
      args: [evalFlag, script, signalName],
      cwd: process.cwd(),
    });

    const posixSignalExitOffset = SIGTERM_EXIT_CODE - osConstants.signals[SIGTERM_NAME];
    expect(result.exitCode).toBe(posixSignalExitOffset + osConstants.signals[signalName]);
  });
});

function createMultibyteStdoutText(): string {
  const asciiPrefix = sampleLiteralTestValue(arbitraryDomainLiteral());
  const multibyteCodePoint = SIGINT_EXIT_CODE + SIGTERM_EXIT_CODE;
  return `${asciiPrefix}${String.fromCodePoint(multibyteCodePoint)}`;
}
