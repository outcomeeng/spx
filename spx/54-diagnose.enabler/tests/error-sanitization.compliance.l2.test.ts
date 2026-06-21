import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { absentManifestPath } from "@testing/harnesses/diagnose/cli";

describe("user-supplied bytes a diagnose error echoes are sanitized before the diagnostic echo", () => {
  it("escapes a control byte in the manifest path rather than emitting it raw to stderr", async () => {
    const controlByte = String.fromCodePoint(7);
    const manifestPath = await absentManifestPath(controlByte);

    const result = await execa(
      NODE_EXECUTABLE,
      [CLI_PATH, DIAGNOSE_CLI.COMMAND, DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath],
      { reject: false },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain(controlByte);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
