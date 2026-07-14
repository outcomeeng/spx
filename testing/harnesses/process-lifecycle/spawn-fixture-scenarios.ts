import { expect } from "vitest";

import { SIGINT_EXIT_CODE } from "@/lib/process-lifecycle";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { runSpawnFixture, SPAWN_FIXTURE_STREAM_EVENTS } from "@testing/harnesses/process-lifecycle/spawn-fixture";

const NODE_EVAL_FLAG = "-e";
const STDOUT_WRITE_INTERVAL_MS = 1;
const MARKER_WRITER_SCRIPT = [
  `process.stdout.on(${
    JSON.stringify(SPAWN_FIXTURE_STREAM_EVENTS.ERROR)
  }, () => process.exit(Number(process.argv[2])));`,
  `setInterval(() => process.stdout.write(process.argv[1]), ${STDOUT_WRITE_INTERVAL_MS});`,
].join("");

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
