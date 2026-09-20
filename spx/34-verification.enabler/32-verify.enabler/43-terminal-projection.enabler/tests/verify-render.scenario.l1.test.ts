import { describe, expect, it } from "vitest";

import { verifyRenderCommand } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_FINDING_DISPOSITION, type VerifyFindingDisposition } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  assertRenderSealedRunProjectionReadOnly,
  finishRun,
  parseRenderReport,
  readVerifyRunEvents,
  reviewAppendScenario,
  verifyRenderOptions,
} from "@testing/harnesses/verify/harness";

describe("verify render scenario", () => {
  it("renders the sealed run's journal projection with the authoritative finding count and appends no event", async () => {
    await assertRenderSealedRunProjectionReadOnly();
  });

  it("renders per-disposition counts and lists filed and stale findings in their own sections apart from blocking and debt", async () => {
    const { scenario, fs, deps, runToken } = await reviewAppendScenario();
    const batches = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.mixedDispositionReviewFindingBatches());
    const defects = await appendFindingBatch(scenario, deps, runToken, batches.defects);
    const filedOrStale = await appendFindingBatch(scenario, deps, runToken, batches.filedOrStale);
    await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
    const eventsBeforeRender = await readVerifyRunEvents(scenario, runToken, fs);
    const report = parseRenderReport(
      (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
    );
    expect(report.findingCounts.total).toBe(defects.length + filedOrStale.length);
    // The spec spells a review disposition in upper case and its section in lower case.
    for (const entry of [...defects, ...filedOrStale]) {
      const section = entry.finding.finding.disposition.toLowerCase() as VerifyFindingDisposition;
      expect(Object.values(VERIFY_FINDING_DISPOSITION)).toContain(section);
      expect(report.findings[section].map((finding) => finding.payload)).toContainEqual(
        JSON.parse(JSON.stringify(entry.finding)),
      );
    }
    for (const disposition of Object.values(VERIFY_FINDING_DISPOSITION)) {
      expect(report.findings[disposition]).toHaveLength(report.findingCounts[disposition]);
      for (const finding of report.findings[disposition]) {
        expect(
          (finding.payload as { readonly finding: { readonly disposition: string } }).finding.disposition.toLowerCase(),
        ).toBe(disposition);
      }
    }
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(eventsBeforeRender.length);
  });
});
