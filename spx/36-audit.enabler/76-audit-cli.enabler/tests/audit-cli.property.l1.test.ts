import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { auditProgressCommand } from "@/commands/audit/lifecycle";
import { AUDIT_RUN_EVENT, AUDIT_RUN_STATE_ERROR } from "@/domains/audit/run-state";
import { AUDIT_CLI, AUDIT_CLI_FLAG } from "@/interfaces/cli/audit";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { AUDIT_RUN_STATE_TEST_GENERATOR, sampleAuditRunStateTestValue } from "@testing/generators/audit/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { createAuditHarness, runSpxAudit, writeAuditConfig } from "@testing/harnesses/audit/harness";

const auditor = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const target = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const branch = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.branchName());
const headSha = sampleAuditRunStateTestValue(AUDIT_RUN_STATE_TEST_GENERATOR.headSha());
const baseRef = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
const unknownProgressStepRuns = 2;
const millisecondsPerSecond = 10 ** 3;
const unknownProgressStepTimeoutMs = 120 * millisecondsPerSecond;

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
                AUDIT_CLI.progressCommandName,
                AUDIT_CLI_FLAG.RUN_FILE,
                runFilePath,
                AUDIT_CLI_FLAG.STEP,
                generatedStep,
                AUDIT_CLI_FLAG.JSON,
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
            }
            const events = await createAppendableJournalStore({ runFilePath }).readAll();
            expect(events.map((event) => event.type)).toEqual([AUDIT_RUN_EVENT.STARTED_TYPE]);
          },
        ),
        { numRuns: unknownProgressStepRuns },
      );
    } finally {
      await harness.cleanup();
    }
  }, unknownProgressStepTimeoutMs);
});

async function initializeDefaultAuditRun(productDir: string): Promise<string> {
  await writeAuditConfig(productDir, {
    baseRef,
    auditors: [auditor],
    include: [target],
  });
  const init = await runSpxAudit([
    AUDIT_CLI.initCommandName,
    AUDIT_CLI_FLAG.BRANCH,
    branch,
    AUDIT_CLI_FLAG.HEAD_SHA,
    headSha,
    AUDIT_CLI_FLAG.JSON,
  ], productDir);
  expect(init.exitCode).toBe(0);
  return (JSON.parse(init.output) as { readonly runFilePath: string }).runFilePath;
}
