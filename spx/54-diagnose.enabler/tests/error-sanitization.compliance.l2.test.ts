import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { ELLIPSIS_TOKEN, MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { absentManifestPath, writeManifestNamingCheck } from "@testing/harnesses/diagnose/cli";

async function runDiagnose(manifestPath: string): Promise<{ readonly stderr: string; readonly exitCode: number }> {
  const result = await execa(NODE_EXECUTABLE, [
    CLI_PATH,
    DIAGNOSE_CLI.COMMAND,
    DIAGNOSE_CLI.MANIFEST_FLAG,
    manifestPath,
  ], {
    reject: false,
  });
  return { stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

describe("user-supplied bytes a diagnose error echoes are sanitized before the diagnostic echo", () => {
  it("escapes a control byte in the manifest path rather than emitting it raw to stderr", async () => {
    const controlByte = String.fromCodePoint(7);
    const manifestPath = await absentManifestPath(controlByte);

    const result = await runDiagnose(manifestPath);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain(controlByte);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("bounds a manifest path longer than the display length and ends the echo in the ellipsis", async () => {
    const infix = sampleGeneratedValue(arbitraryDomainLiteral()).repeat(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
    const manifestPath = await absentManifestPath(infix);

    const result = await runDiagnose(manifestPath);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain(manifestPath);
    expect(result.stderr).toContain(ELLIPSIS_TOKEN);
  });

  it("escapes a control byte in a manifest-named check rather than emitting it raw to stderr", async () => {
    const controlByte = String.fromCodePoint(7);
    const manifestPath = await writeManifestNamingCheck(`${CHECK_NAME.SPX_REACHABILITY}${controlByte}`);

    const result = await runDiagnose(manifestPath);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain(controlByte);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
