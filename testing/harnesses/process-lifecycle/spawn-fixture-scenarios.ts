import { join } from "node:path";

import { expect } from "vitest";

import { SIGINT_EXIT_CODE, SIGINT_NAME, SIGTERM_EXIT_CODE, SIGTERM_NAME } from "@/lib/process-lifecycle";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { arbitraryUnknownSignalName } from "@testing/generators/process-lifecycle/spawn-fixture";
import {
  resolveSpawnFixtureExitCode,
  runSpawnFixture,
  SPAWN_FIXTURE_STREAM_EVENTS,
  SPAWN_FIXTURE_UNKNOWN_EXIT_CODE,
} from "@testing/harnesses/process-lifecycle/spawn-fixture";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const NODE_EVAL_FLAG = "-e";
const STDOUT_WRITE_INTERVAL_MS = 1;
const MULTIBYTE_STDOUT_CODE_POINT = 0x111;
const RESULT_CAPTURE_SCRIPT = [
  "process.stdout.write(process.argv[1]);",
  "process.stderr.write(process.argv[2]);",
  "process.exit(Number(process.argv[3]));",
].join("");
const SIGNAL_EXIT_SCRIPT = "process.kill(process.pid, process.argv[1]);";
const MARKER_WRITER_SCRIPT = [
  `process.stdout.on(${
    JSON.stringify(SPAWN_FIXTURE_STREAM_EVENTS.ERROR)
  }, () => process.exit(Number(process.argv[2])));`,
  `setInterval(() => process.stdout.write(process.argv[1]), ${STDOUT_WRITE_INTERVAL_MS});`,
].join("");

export function registerSpawnFixtureScenarioEvidence(): void {
  describe("Scenario: spawn fixture result capture", () => {
    it("reports numeric exit status, stderr text, and observed stdout bytes", async () => {
      const stdoutText = createMultibyteStdoutText();
      const stderrText = sampleLiteralTestValue(arbitraryDomainLiteral());
      const result = await runSpawnFixture({
        command: process.execPath,
        args: [NODE_EVAL_FLAG, RESULT_CAPTURE_SCRIPT, stdoutText, stderrText, String(SIGINT_EXIT_CODE)],
        cwd: process.cwd(),
      });

      expect(result.exitCode).toBe(SIGINT_EXIT_CODE);
      expect(result.stderr).toBe(stderrText);
      expect(result.stdoutBytesObserved).toBe(Buffer.byteLength(stdoutText));
    });

    it("maps SIGTERM child termination to the conventional exit code", async () => {
      const result = await runSpawnFixture({
        command: process.execPath,
        args: [NODE_EVAL_FLAG, SIGNAL_EXIT_SCRIPT, SIGTERM_NAME],
        cwd: process.cwd(),
      });

      expect(result.exitCode).toBe(SIGTERM_EXIT_CODE);
    });

    it("maps another standard signal through Node's signal table", async () => {
      const result = await runSpawnFixture({
        command: process.execPath,
        args: [NODE_EVAL_FLAG, SIGNAL_EXIT_SCRIPT, SIGINT_NAME],
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
}

export function registerSpawnFixturePropertyEvidence(): void {
  describe("Property: spawn fixture signal exit resolution", () => {
    it("returns the unknown exit code for every signal absent from Node's signal table", () => {
      assertProperty(
        arbitraryUnknownSignalName(),
        (signalName) => {
          expect(resolveSpawnFixtureExitCode(null, signalName)).toBe(SPAWN_FIXTURE_UNKNOWN_EXIT_CODE);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}

export async function assertSpawnFixtureClosesStdoutAfterMarker(): Promise<void> {
  const marker = sampleLiteralTestValue(arbitraryDomainLiteral());
  const result = await runSpawnFixture({
    command: process.execPath,
    args: [NODE_EVAL_FLAG, MARKER_WRITER_SCRIPT, marker, String(SIGINT_EXIT_CODE)],
    cwd: process.cwd(),
    destroyStdoutAfterMarker: marker,
  });

  expect(result.stdoutMarkerObserved).toBe(true);
  expect(result.stdoutBytesObserved).toBeGreaterThanOrEqual(Buffer.byteLength(marker));
  expect(result.exitCode).toBe(SIGINT_EXIT_CODE);
}

function createMultibyteStdoutText(): string {
  const asciiPrefix = sampleLiteralTestValue(arbitraryDomainLiteral());
  return `${asciiPrefix}${String.fromCodePoint(MULTIBYTE_STDOUT_CODE_POINT)}`;
}
