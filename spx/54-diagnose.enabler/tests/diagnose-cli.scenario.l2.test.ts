import { execa } from "execa";
import fc from "fast-check";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { overallExitCode } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_FORMAT } from "@/domains/diagnose/report";
import { OVERALL_VERDICT, type OverallVerdict, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { arbitrarySpxFloor } from "@testing/generators/diagnose/manifest";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";

interface ReportShape {
  readonly checks: {
    readonly name: string;
    readonly verdict: string;
    readonly bucket: string;
    readonly readings: Record<string, string>;
    readonly remediation: string;
  }[];
  readonly overall: string;
}

describe("spx diagnose emits a schema-valid report and exits with the code keyed to the overall verdict", () => {
  it("runs the manifest's check, prints a conforming JSON report, and exits with the verdict's exit code", async () => {
    const [floor] = fc.sample(arbitrarySpxFloor(), { numRuns: 1, seed: 7 });
    const dir = await mkdtemp(join(tmpdir(), "diagnose-cli-"));
    const manifestPath = join(dir, "diagnose.json");
    await writeFile(manifestPath, JSON.stringify({ checks: [CHECK_NAME.SPX_REACHABILITY], spx_floor: floor }));

    const result = await execa(
      NODE_EXECUTABLE,
      [
        CLI_PATH,
        DIAGNOSE_CLI.COMMAND,
        DIAGNOSE_CLI.MANIFEST_FLAG,
        manifestPath,
        DIAGNOSE_CLI.FORMAT_FLAG,
        DIAGNOSE_FORMAT.JSON,
      ],
      { reject: false },
    );

    const report = JSON.parse(result.stdout) as ReportShape;
    expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].name).toBe(CHECK_NAME.SPX_REACHABILITY);
    expect(Object.values(VERDICT_BUCKET)).toContain(report.checks[0].bucket);
    expect(result.exitCode).toBe(overallExitCode(report.overall as OverallVerdict));
  });
});
