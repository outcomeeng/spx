import { describe, expect, it } from "vitest";

import { DIAGNOSE_TEXT_HEADER, DIAGNOSE_TEXT_LABEL, DIAGNOSE_TEXT_OVERALL_LABEL } from "@/domains/diagnose/report";
import { OVERALL_VERDICT } from "@/domains/diagnose/types";
import { DIAGNOSE_CLI } from "@/interfaces/cli/diagnose";
import { DIAGNOSE_OUTPUT_TEST_POLICY, withDiagnoseOutputCli } from "@testing/harnesses/diagnose/output-modes";

describe("the default diagnose output is concise", () => {
  it(
    "names the executing version, actionable checks, verdict, and detail selectors",
    DIAGNOSE_OUTPUT_TEST_POLICY,
    async () => {
      await withDiagnoseOutputCli(async (env) => {
        const result = await env.run([]);
        expect(result.stdout).toContain(env.version);
        expect(result.stdout).toContain(`${DIAGNOSE_TEXT_OVERALL_LABEL}: ${OVERALL_VERDICT.DEGRADED}`);
        expect(result.stdout).toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNAVAILABLE);
        expect(result.stdout).toContain(DIAGNOSE_CLI.VERBOSE_FLAG);
        expect(result.stdout).toContain(DIAGNOSE_CLI.JSON_FLAG);
        expect(result.stdout).not.toContain(`${DIAGNOSE_TEXT_LABEL.WORKTREES}:`);
        expect(result.stdout).not.toContain(`${DIAGNOSE_TEXT_LABEL.CONFIGURED_SOURCE}:`);
      });
    },
  );

  it(
    "omits the healthy checks the detailed diagnosis reports",
    DIAGNOSE_OUTPUT_TEST_POLICY,
    async () => {
      await withDiagnoseOutputCli(async (env) => {
        const concise = await env.run([]);
        const detailed = await env.run([DIAGNOSE_CLI.VERBOSE_FLAG]);
        expect(detailed.stdout).toContain(DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID);
        expect(detailed.stdout).toContain(DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN);
        expect(concise.stdout).not.toContain(DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID);
        expect(concise.stdout).not.toContain(DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN);
        expect(concise.stdout).toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNAVAILABLE);
      });
    },
  );
});
