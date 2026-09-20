import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyFinishCommand } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_FINDING_DISPOSITION, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  assertFinishStatusAndRenderProjectTerminalMetadata,
  assertReviewTerminalMetadataStateMapsTerminalStatus,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  parseFinishReport,
  startedRunToken,
  verifyFinishOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("review envelope projection", () => {
  it("maps terminal metadata into finish, status, and render projections", async () => {
    await assertFinishStatusAndRenderProjectTerminalMetadata();
  });

  it("maps review terminal states into terminal status", async () => {
    await assertReviewTerminalMetadataStateMapsTerminalStatus();
  });

  it("lets a run whose findings are all FILED or STALE take each envelope state's status", async () => {
    for (
      const [terminalMetadata, terminalStatus] of [
        [
          sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata()),
          JOURNAL_RUN_STATE_STATUS.APPROVED,
        ],
        [
          sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewChangesRequestedTerminalMetadata()),
          JOURNAL_RUN_STATE_STATUS.REJECTED,
        ],
        [
          sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewCommentedTerminalMetadata()),
          JOURNAL_RUN_STATE_STATUS.APPROVED,
        ],
      ] as const
    ) {
      const { scenario, deps } = createVerifyAppendScenario(
        withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
      );
      const runToken = await startedRunToken(scenario, deps);
      const findings = await appendFindingBatch(
        scenario,
        deps,
        runToken,
        sampleVerifyTestValue(VERIFY_TEST_GENERATOR.filedOrStaleReviewFindingBatch()),
      );
      const finished = await verifyFinishCommand(
        {
          ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
          terminalMetadata: JSON.stringify(terminalMetadata),
        },
        deps,
      );
      expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
      const report = parseFinishReport(finished.output);
      expect(report.terminalStatus).toBe(terminalStatus);
      expect(report.findingCount).toBe(findings.length);
      expect(report.findingCounts.total).toBe(findings.length);
      expect(report.findingCounts[VERIFY_FINDING_DISPOSITION.BLOCKING]).toBe(0);
      expect(report.findingCounts[VERIFY_FINDING_DISPOSITION.DEBT]).toBe(0);
      expect(
        report.findingCounts[VERIFY_FINDING_DISPOSITION.FILED] + report.findingCounts[VERIFY_FINDING_DISPOSITION.STALE],
      ).toBe(findings.length);
    }
  });

  it("lets a BLOCKING or DEBT finding determine rejection whatever the envelope states", async () => {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const batches = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.mixedDispositionReviewFindingBatches());
    await appendFindingBatch(scenario, deps, runToken, batches.filedOrStale);
    await appendFindingBatch(scenario, deps, runToken, batches.defects);
    const approved = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED }),
        terminalMetadata: JSON.stringify(
          sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata()),
        ),
      },
      deps,
    );
    expect(approved.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(approved.output.startsWith(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT)).toBe(true);
    const rejected = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED }),
      deps,
    );
    expect(rejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseFinishReport(rejected.output).terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.REJECTED);
  });
});
