import { describe, expect, it } from "vitest";

import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { ESCAPE_CONTROL_CHAR_CODE, MAX_CLI_ARGUMENT_DISPLAY_LENGTH } from "@/lib/sanitize-cli-argument";
import { arbitraryLongDiagnoseErrorToken } from "@testing/generators/diagnose/output-modes";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withDiagnoseCli } from "@testing/harnesses/diagnose/cli";
import { DIAGNOSE_OUTPUT_TEST_POLICY } from "@testing/harnesses/diagnose/output-modes";

describe("diagnose errors escape external bytes without truncating messages", () => {
  it("escapes a terminal-control byte in the manifest path", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const controlByte = String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE);
      const manifestPath = env.absentManifestPath(controlByte);
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).not.toContain(controlByte);
      expect(result.stderr).toContain(String.raw`\x1b`);
    });
  });

  it(
    "reports the full caught-error message beyond the operand display bound",
    DIAGNOSE_OUTPUT_TEST_POLICY,
    async () => {
      await withDiagnoseCli(async (env) => {
        const manifestPath = env.absentManifestPath(sampleGeneratedValue(arbitraryLongDiagnoseErrorToken()));
        const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);
        expect(result.exitCode).toBe(1);
        expect(result.stderr.length).toBeGreaterThan(MAX_CLI_ARGUMENT_DISPLAY_LENGTH);
        expect(result.stderr).toContain(manifestPath);
      });
    },
  );

  it("escapes a terminal-control byte in a manifest-named check", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const controlByte = String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE);
      const manifestPath = await env.writeManifestNamingCheck(`${CHECK_NAME.SPX_REACHABILITY}${controlByte}`);
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).not.toContain(controlByte);
      expect(result.stderr).toContain(String.raw`\x1b`);
    });
  });
});
