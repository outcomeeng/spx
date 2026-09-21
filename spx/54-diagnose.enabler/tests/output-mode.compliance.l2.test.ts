import { describe, expect, it } from "vitest";

import { DIAGNOSE_FORMAT } from "@/domains/diagnose/report";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { DIAGNOSE_OUTPUT_TEST_POLICY, withDiagnoseOutputCli } from "@testing/harnesses/diagnose/output-modes";

describe("diagnose output selectors are mutually exclusive", () => {
  it("rejects the retired format selector", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseOutputCli(async (env) => {
      const result = await env.run([DIAGNOSE_CLI.RETIRED_FORMAT_FLAG, DIAGNOSE_FORMAT.JSON]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(DIAGNOSE_CLI.RETIRED_FORMAT_FLAG);
    });
  });

  it("rejects both selectors before attempting to read the manifest", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseOutputCli(async (env) => {
      const result = await env.run([
        DIAGNOSE_CLI.VERBOSE_FLAG,
        DIAGNOSE_CLI.JSON_FLAG,
        DIAGNOSE_CLI.MANIFEST_FLAG,
        env.missingManifest,
      ]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(DIAGNOSE_CLI.VERBOSE_FLAG);
      expect(result.stderr).toContain(DIAGNOSE_CLI.JSON_FLAG);
      expect(result.stderr).not.toContain(env.missingManifest);
    });
  });
});
