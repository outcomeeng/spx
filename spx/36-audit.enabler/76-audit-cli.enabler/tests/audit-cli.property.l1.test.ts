import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { auditProgressCommand } from "@/commands/audit/lifecycle";
import { AUDIT_RUN_EVENT, AUDIT_RUN_STATE_ERROR } from "@/domains/audit/run-state";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR } from "@testing/generators/audit/run-state";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { createAuditHarness } from "@testing/harnesses/audit/harness";

const AUDITOR = "typescript-test-auditor";
const TARGET = "src/plugins/typescript/skills/audit-typescript-tests";
const BRANCH = "audit-lifecycle-slice";
const HEAD_SHA = "0000000000000000000000000000000000000000";
const BASE_REF = "origin/main";
const UNKNOWN_PROGRESS_STEP_RUNS = 2;

describe("audit CLI progress step properties", () => {
  it("rejects every generated unknown progress step without appending to the run journal", async () => {
    const harness = await createAuditHarness();
    try {
      const runFilePath = await initializeDefaultAuditRun(harness.productDir);

      await fc.assert(
        fc.asyncProperty(
          AUDIT_RUN_STATE_TEST_GENERATOR.unknownProgressStepCohort(),
          async (generatedSteps) => {
            for (const generatedStep of generatedSteps) {
              const progress = await runSpxAudit([
                "progress",
                "--run-file",
                runFilePath,
                "--step",
                generatedStep,
                "--json",
              ], harness.productDir);

              expect(progress.exitCode).toBe(1);
              expect((JSON.parse(progress.errorOutput) as { readonly error: string }).error).toBe(
                AUDIT_RUN_STATE_ERROR.UNKNOWN_PROGRESS_STEP,
              );

              const directProgress = await auditProgressCommand({
                runFile: runFilePath,
                step: generatedStep,
                json: true,
              });
              expect(directProgress.exitCode).toBe(1);
              expect((JSON.parse(directProgress.output) as { readonly error: string }).error).toBe(
                AUDIT_RUN_STATE_ERROR.UNKNOWN_PROGRESS_STEP,
              );

              const events = await createAppendableJournalStore({ runFilePath }).readAll();
              expect(events.map((event) => event.type)).toEqual([AUDIT_RUN_EVENT.STARTED_TYPE]);
            }
          },
        ),
        { numRuns: UNKNOWN_PROGRESS_STEP_RUNS },
      );
    } finally {
      await harness.cleanup();
    }
  });
});

async function runSpxAudit(args: readonly string[], cwd: string): Promise<{
  readonly output: string;
  readonly errorOutput: string;
  readonly exitCode: number;
}> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, "audit", ...args], { cwd, reject: false });
  return { output: result.stdout, errorOutput: result.stderr, exitCode: result.exitCode ?? 1 };
}

async function initializeDefaultAuditRun(productDir: string): Promise<string> {
  await writeAuditConfig(productDir);
  const init = await runSpxAudit([
    "init",
    "--branch",
    BRANCH,
    "--head-sha",
    HEAD_SHA,
    "--json",
  ], productDir);
  expect(init.exitCode).toBe(0);
  return (JSON.parse(init.output) as { readonly runFilePath: string }).runFilePath;
}

async function writeAuditConfig(productDir: string): Promise<void> {
  await writeFile(
    join(productDir, "spx.config.yaml"),
    [
      "audit:",
      `  baseRef: ${BASE_REF}`,
      "  auditors:",
      `    - ${AUDITOR}`,
      "  targets:",
      "    include:",
      `      - ${TARGET}`,
      "",
    ].join("\n"),
  );
}
