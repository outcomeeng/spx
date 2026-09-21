import { describe, expect, it } from "vitest";

import { DEFAULT_METHODOLOGY_SOURCE } from "@/config/methodology";
import { MARKETPLACE_INSTALL_VERDICT } from "@/domains/diagnose/checks/marketplace-install";
import {
  METHODOLOGY_CONTEXT_READING_VALUE,
  METHODOLOGY_CONTEXT_VERDICT,
} from "@/domains/diagnose/checks/methodology-context";
import { SESSION_ENVIRONMENT_VERDICT } from "@/domains/diagnose/checks/session-environment";
import { SESSION_STORE_VERDICT } from "@/domains/diagnose/checks/session-store";
import { SPX_REACHABILITY_READING_VALUE, SPX_REACHABILITY_VERDICT } from "@/domains/diagnose/checks/spx-reachability";
import { WORKTREE_POOL_VERDICT } from "@/domains/diagnose/checks/worktree-pool";
import { foldOverallVerdict, overallExitCode } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_TEXT_OVERALL_LABEL } from "@/domains/diagnose/report";
import { CHECK_RECORD_FIELDS, type DiagnoseReport, OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { METHODOLOGY_CODING_AGENTS } from "@/lib/methodology";
import { ESCAPE_CONTROL_CHAR_CODE } from "@/lib/sanitize-cli-argument";
import {
  bareDiagnoseScenario,
  configuredDiagnoseScenario,
  invalidMethodologyScenario,
  malformedDiagnoseScenario,
  unusedMethodologyScenario,
} from "@testing/generators/diagnose/cli-scenarios";
import { withDiagnoseCli } from "@testing/harnesses/diagnose/cli";
import { withDiagnoseCliScenario } from "@testing/harnesses/diagnose/cli-scenarios";
import { DIAGNOSE_OUTPUT_TEST_POLICY } from "@testing/harnesses/diagnose/output-modes";
import { METHODOLOGY_FIXTURE_VERSION } from "@testing/harnesses/spec/context";

describe("spx diagnose resolves facts and emits verdict-keyed reports", () => {
  it("runs the manifest check and prints a schema-valid JSON report", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const fixture = await env.writeReachabilityManifest();
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, fixture.manifestPath, DIAGNOSE_CLI.JSON_FLAG]);
      const report = JSON.parse(result.stdout) as DiagnoseReport;
      expect(Object.values(OVERALL_VERDICT)).toContain(report.overall);
      for (const check of report.checks) {
        expect(new Set(Object.keys(check))).toEqual(new Set(CHECK_RECORD_FIELDS));
        expect(Object.values(CHECK_NAME)).toContain(check.name);
        expect(Object.values(VERDICT_BUCKET)).toContain(check.bucket);
      }
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0].name).toBe(CHECK_NAME.SPX_REACHABILITY);
      expect(report.checks[0].readings.floor).toBe(fixture.spxFloor);
      expect(report.overall).toBe(foldOverallVerdict(report.checks.map((check) => check.bucket)));
      expect(result.exitCode).toBe(overallExitCode(report.overall));
    });
  });

  it("keeps the default human report and JSON report on the same verdict", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const fixture = await env.writeReachabilityManifest();
      const textRun = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, fixture.manifestPath]);
      const jsonRun = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, fixture.manifestPath, DIAGNOSE_CLI.JSON_FLAG]);
      const report = JSON.parse(jsonRun.stdout) as DiagnoseReport;
      expect(textRun.stdout).not.toContain(CHECK_NAME.SPX_REACHABILITY);
      expect(textRun.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
      expect(textRun.exitCode).toBe(overallExitCode(report.overall));
      expect(jsonRun.exitCode).toBe(textRun.exitCode);
    });
  });

  it("runs every registered check from a complete manifest", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const manifestPath = await env.writeAllChecksManifest();
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, manifestPath, DIAGNOSE_CLI.JSON_FLAG]);
      const report = JSON.parse(result.stdout) as DiagnoseReport;
      expect(report.checks.map((check) => check.name)).toEqual(Object.values(CHECK_NAME));
      const methodology = report.checks.find((check) => check.name === CHECK_NAME.METHODOLOGY_CONTEXT);
      const marketplace = report.checks.find((check) => check.name === CHECK_NAME.MARKETPLACE_INSTALL);
      expect(Object.values(METHODOLOGY_CONTEXT_VERDICT)).toContain(methodology?.verdict);
      expect(methodology?.readings.configuredSource).toBe(DEFAULT_METHODOLOGY_SOURCE);
      expect(methodology?.readings.configuredVersion).toBe(METHODOLOGY_FIXTURE_VERSION);
      expect(marketplace?.readings.configured).toBe(String(true));
      expect(marketplace?.verdict).not.toBe(MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE);
      expect(report.overall).toBe(foldOverallVerdict(report.checks.map((check) => check.bucket)));
      expect(result.exitCode).toBe(overallExitCode(report.overall));
    });
  });

  it("renders ANSI styling when color is forced", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const fixture = await env.writeReachabilityManifest();
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, fixture.manifestPath, DIAGNOSE_CLI.COLOR_FLAG]);
      expect(result.stdout).toContain(String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE));
    });
  });

  it("keeps piped output free of ANSI escapes", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const fixture = await env.writeReachabilityManifest();
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, fixture.manifestPath]);
      expect(result.stdout).not.toContain(String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE));
    });
  });

  it("honors the no-color selector", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const fixture = await env.writeReachabilityManifest();
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, fixture.manifestPath, DIAGNOSE_CLI.NO_COLOR_FLAG]);
      expect(result.stdout).not.toContain(String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE));
    });
  });

  it("honors a nonempty NO_COLOR environment value", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCli(async (env) => {
      const fixture = await env.writeReachabilityManifest();
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, fixture.manifestPath], { env: env.noColorEnvironment });
      expect(result.stdout).not.toContain(String.fromCodePoint(ESCAPE_CONTROL_CHAR_CODE));
    });
  });

  it("resolves configured check selection and floor without a manifest", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCliScenario(configuredDiagnoseScenario(), async (env, scenario) => {
      const result = await env.run([DIAGNOSE_CLI.JSON_FLAG]);
      const report = JSON.parse(result.stdout) as DiagnoseReport;
      expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
      expect(report.checks[0].readings.floor).toBe(scenario.floor);
      expect(report.checks[0].verdict).not.toBe(SPX_REACHABILITY_VERDICT.PRESENT);
      expect(result.exitCode).toBe(overallExitCode(report.overall));
    });
  });

  it("ignores methodology configuration for checks that do not consume it", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCliScenario(unusedMethodologyScenario(), async (env, scenario) => {
      const result = await env.run([DIAGNOSE_CLI.JSON_FLAG]);
      const report = JSON.parse(result.stdout) as DiagnoseReport;
      expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
      expect(report.checks[0].readings.floor).toBe(scenario.floor);
      expect(result.exitCode).toBe(overallExitCode(report.overall));
    });
  });

  it(
    "reports invalid methodology configuration while default checks still run",
    DIAGNOSE_OUTPUT_TEST_POLICY,
    async () => {
      await withDiagnoseCliScenario(invalidMethodologyScenario(), async (env) => {
        const result = await env.run([DIAGNOSE_CLI.JSON_FLAG]);
        const report = JSON.parse(result.stdout) as DiagnoseReport;
        const methodology = report.checks.find((check) => check.name === CHECK_NAME.METHODOLOGY_CONTEXT);
        expect(new Set(report.checks.map((check) => check.name))).toEqual(new Set(Object.values(CHECK_NAME)));
        expect(methodology?.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
        expect(methodology?.bucket).toBe(VERDICT_BUCKET.UNKNOWN);
        expect(methodology?.readings.configured).toBe(String(true));
        expect(result.exitCode).toBe(overallExitCode(report.overall));
      });
    },
  );

  it("lets a manifest take precedence over malformed diagnose configuration", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCliScenario(malformedDiagnoseScenario(), async (env) => {
      const fixture = await env.writeReachabilityManifest();
      const result = await env.run([DIAGNOSE_CLI.MANIFEST_FLAG, fixture.manifestPath, DIAGNOSE_CLI.JSON_FLAG]);
      const report = JSON.parse(result.stdout) as DiagnoseReport;
      expect(report.checks.map((check) => check.name)).toEqual([CHECK_NAME.SPX_REACHABILITY]);
      expect(report.checks[0].readings.floor).toBe(fixture.spxFloor);
      expect(result.exitCode).toBe(overallExitCode(report.overall));
    });
  });

  it("runs bare without manifest or diagnose configuration", DIAGNOSE_OUTPUT_TEST_POLICY, async () => {
    await withDiagnoseCliScenario(bareDiagnoseScenario(), async (env) => {
      const result = await env.run([DIAGNOSE_CLI.JSON_FLAG], { env: env.isolatedEnvironment });
      const report = JSON.parse(result.stdout) as DiagnoseReport;
      const textRun = await env.run([], { env: env.isolatedEnvironment });
      const spx = report.checks.find((check) => check.name === CHECK_NAME.SPX_REACHABILITY);
      const session = report.checks.find((check) => check.name === CHECK_NAME.SESSION_ENVIRONMENT);
      const worktree = report.checks.find((check) => check.name === CHECK_NAME.WORKTREE_POOL);
      const store = report.checks.find((check) => check.name === CHECK_NAME.SESSION_STORE);
      const marketplace = report.checks.find((check) => check.name === CHECK_NAME.MARKETPLACE_INSTALL);
      const methodology = report.checks.find((check) => check.name === CHECK_NAME.METHODOLOGY_CONTEXT);
      expect(new Set(report.checks.map((check) => check.name))).toEqual(new Set(Object.values(CHECK_NAME)));
      expect([SPX_REACHABILITY_VERDICT.PRESENT, SPX_REACHABILITY_VERDICT.UNREACHABLE]).toContain(spx?.verdict);
      expect(spx?.readings.floor).toBe(SPX_REACHABILITY_READING_VALUE.ABSENT_FLOOR);
      expect(session?.verdict).toBe(SESSION_ENVIRONMENT_VERDICT.UNKNOWN);
      expect(session?.readings).toEqual({ hook: String(false), identity: String(false), claimed: String(false) });
      expect(worktree?.verdict).toBe(WORKTREE_POOL_VERDICT.UNKNOWN);
      expect(worktree?.readings).toMatchObject({
        bare: String(false),
        linked: String(false),
        mainCheckoutBranchRead: String(false),
        running: String(0),
        free: String(0),
      });
      expect(worktree?.readings.mainCheckoutPath).toHaveLength(0);
      expect(worktree?.readings.defaultBranch).toHaveLength(0);
      expect(worktree?.readings.mainCheckoutBranch).toHaveLength(0);
      expect(store?.verdict).toBe(SESSION_STORE_VERDICT.UNKNOWN);
      expect(store?.readings.orphaned).toBe(String(0));
      expect(marketplace?.verdict).toBe(MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE);
      expect(marketplace?.readings).toEqual({
        configured: String(false),
        surface: String(false),
        unregistered: String(false),
        drifted: String(false),
      });
      expect(methodology?.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNDECLARED);
      expect(methodology?.readings.configuredSource).toBe(DEFAULT_METHODOLOGY_SOURCE);
      expect(methodology?.readings).toEqual({
        configured: String(true),
        configuredSource: DEFAULT_METHODOLOGY_SOURCE,
        configuredVersion: METHODOLOGY_CONTEXT_READING_VALUE.ABSENT,
        migratingFrom: METHODOLOGY_CONTEXT_READING_VALUE.ABSENT,
        line: METHODOLOGY_CONTEXT_READING_VALUE.ABSENT,
        shippedLines: METHODOLOGY_CONTEXT_READING_VALUE.NONE,
        shippedCodingAgents: METHODOLOGY_CONTEXT_READING_VALUE.NONE,
        enabledCodingAgents: [...METHODOLOGY_CODING_AGENTS].join(", "),
        providerMatch: METHODOLOGY_CONTEXT_READING_VALUE.ABSENT,
      });
      expect(report.overall).toBe(foldOverallVerdict(report.checks.map((check) => check.bucket)));
      expect(textRun.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${report.overall}`);
      expect(textRun.exitCode).toBe(result.exitCode);
    });
  });
});
