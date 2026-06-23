import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG_FILENAME } from "@/config/index";
import { SPX_REACHABILITY_VERDICT } from "@/domains/diagnose/checks/spx-reachability";
import { overallExitCode } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_FORMAT, DIAGNOSE_TEXT_OVERALL_LABEL } from "@/domains/diagnose/report";
import { OVERALL_VERDICT, type OverallVerdict, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { CLI_PATH, CLI_TIMEOUTS_MS, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { writeAllChecksManifest, writeSpxReachabilityManifest } from "@testing/harnesses/diagnose/cli";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

// The ANSI escape (ESC) code point; built here to avoid an invisible control byte in source.
const escCharCode = 27;
const ansiEscape = String.fromCodePoint(escCharCode);

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

async function runDiagnose(
  args: readonly string[],
  options?: { readonly env?: NodeJS.ProcessEnv; readonly cwd?: string },
): Promise<{ readonly stdout: string; readonly exitCode: number }> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, DIAGNOSE_CLI.COMMAND, ...args], {
    reject: false,
    env: options?.env,
    cwd: options?.cwd,
  });
  return { stdout: result.stdout, exitCode: result.exitCode ?? 1 };
}

describe("spx diagnose emits a schema-valid report and exits with the code keyed to the overall verdict", () => {
  it("runs the manifest's check, prints a conforming JSON report, and exits with the verdict's exit code", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.FORMAT_FLAG,
      DIAGNOSE_FORMAT.JSON,
    ]);

    const report = JSON.parse(result.stdout) as ReportShape;
    expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].name).toBe(CHECK_NAME.SPX_REACHABILITY);
    expect(Object.values(VERDICT_BUCKET)).toContain(report.checks[0].bucket);
    expect(result.exitCode).toBe(overallExitCode(report.overall as OverallVerdict));
  });

  it("defaults to the text format and carries the same overall verdict and exit code as the JSON report", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const textRun = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);
    const jsonRun = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.FORMAT_FLAG,
      DIAGNOSE_FORMAT.JSON,
    ]);

    const report = JSON.parse(jsonRun.stdout) as ReportShape;
    expect(textRun.stdout).toContain(CHECK_NAME.SPX_REACHABILITY);
    expect(textRun.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
    expect(textRun.exitCode).toBe(jsonRun.exitCode);
    expect(textRun.exitCode).toBe(overallExitCode(report.overall as OverallVerdict));
  });

  it("runs every registered check and exits with the code keyed to the folded overall verdict", async () => {
    const manifestPath = await writeAllChecksManifest();

    const result = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.FORMAT_FLAG,
      DIAGNOSE_FORMAT.JSON,
    ]);

    const report = JSON.parse(result.stdout) as ReportShape;
    expect(report.checks.map((check) => check.name)).toEqual(Object.values(CHECK_NAME));
    for (const check of report.checks) {
      expect(Object.values(VERDICT_BUCKET)).toContain(check.bucket);
    }
    expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
    expect(result.exitCode).toBe(overallExitCode(report.overall as OverallVerdict));
  });

  it("rejects an unsupported --format value with a non-zero exit", async () => {
    const manifestPath = await writeSpxReachabilityManifest();
    const unsupportedFormat = `${DIAGNOSE_FORMAT.JSON}${DIAGNOSE_FORMAT.TEXT}`;

    const result = await runDiagnose([
      DIAGNOSE_CLI.MANIFEST_FLAG,
      manifestPath,
      DIAGNOSE_CLI.FORMAT_FLAG,
      unsupportedFormat,
    ]);

    expect(result.exitCode).not.toBe(0);
  });

  it("emits ANSI escapes in the text report when --color forces color at the descriptor boundary", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.COLOR_FLAG]);

    expect(result.stdout).toContain(ansiEscape);
  });

  it("emits no ANSI escape in the default piped, non-TTY text report", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath]);

    expect(result.stdout).not.toContain(ansiEscape);
  });

  it("emits no ANSI escape when --no-color disables color at the descriptor boundary", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.NO_COLOR_FLAG]);

    expect(result.stdout).not.toContain(ansiEscape);
  });

  it("resolves the check set and floor from the spx.config diagnose section when no --manifest is supplied", async () => {
    await withTempDir("diagnose-config", async (cwd) => {
      // The configured check set restricts the run to one check, and a configured floor makes
      // spx-reachability perform a floor comparison — so its verdict is never the no-floor `present`
      // that bare mode yields. Both signals prove the config diagnose section was resolved, without
      // assuming whether spx happens to be on PATH in the test environment.
      const config = ["diagnose:", "  spxFloor: \"0.0.0\"", `  checks: ["${CHECK_NAME.SPX_REACHABILITY}"]`].join("\n");
      await writeFile(join(cwd, DEFAULT_CONFIG_FILENAME), `${config}\n`);

      const result = await runDiagnose([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

      const report = JSON.parse(result.stdout) as ReportShape;
      expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
      expect(report.checks[0].verdict).not.toBe(SPX_REACHABILITY_VERDICT.PRESENT);
    });
  });

  it(
    "runs bare with no manifest and no diagnose config, rendering every registered check with a verdict-keyed exit",
    async () => {
      await withTempDir("diagnose-bare", async (cwd) => {
        const result = await runDiagnose([DIAGNOSE_CLI.FORMAT_FLAG, DIAGNOSE_FORMAT.JSON], { cwd });

        const report = JSON.parse(result.stdout) as ReportShape;
        expect(new Set(report.checks.map((check) => check.name))).toEqual(new Set(Object.values(CHECK_NAME)));
        expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
        expect(result.exitCode).toBe(overallExitCode(report.overall as OverallVerdict));
      });
    },
    // Bare mode spawns the CLI running all five real probes (git, spx, plugin CLIs, filesystem);
    // under test-suite subprocess contention this needs the batched-E2E guardrail, not the 30s default.
    CLI_TIMEOUTS_MS.E2E_BATCH,
  );

  it("emits no ANSI escape when a non-empty NO_COLOR environment variable disables color", async () => {
    const manifestPath = await writeSpxReachabilityManifest();

    const result = await runDiagnose([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath], {
      env: { ...process.env, NO_COLOR: "1" },
    });

    expect(result.stdout).not.toContain(ansiEscape);
  });
});
