import { describe, expect, it } from "vitest";

import { verifyRenderCommand } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  REVIEW_FINDING_DISPOSITION_CLASS,
  VERIFY_FINDING_DISPOSITION,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  assertRenderSealedRunProjectionReadOnly,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRun,
  parseRenderReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyRenderOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify render scenario", () => {
  it("renders the sealed run's journal projection with the authoritative finding count and appends no event", async () => {
    await assertRenderSealedRunProjectionReadOnly();
  });

  it("renders per-disposition counts and lists filed and stale findings in their own sections apart from blocking and debt", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const batches = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.mixedDispositionReviewFindingBatches());
    const defects = await appendFindingBatch(scenario, deps, runToken, batches.defects);
    const filedOrStale = await appendFindingBatch(scenario, deps, runToken, batches.filedOrStale);
    await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
    const eventsBeforeRender = await readVerifyRunEvents(scenario, runToken, fs);
    const report = parseRenderReport(
      (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
    );
    expect(report.findingCounts.total).toBe(defects.length + filedOrStale.length);
    for (const entry of [...defects, ...filedOrStale]) {
      const section = report.findings[REVIEW_FINDING_DISPOSITION_CLASS[entry.finding.finding.disposition]];
      expect(section.map((finding) => finding.payload)).toContainEqual(JSON.parse(JSON.stringify(entry.finding)));
    }
    for (const disposition of Object.values(VERIFY_FINDING_DISPOSITION)) {
      expect(report.findings[disposition]).toHaveLength(report.findingCounts[disposition]);
      for (const finding of report.findings[disposition]) {
        expect(
          REVIEW_FINDING_DISPOSITION_CLASS[
            (finding.payload as {
              readonly finding: { readonly disposition: keyof typeof REVIEW_FINDING_DISPOSITION_CLASS };
            })
              .finding.disposition
          ],
        ).toBe(disposition);
      }
    }
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(eventsBeforeRender.length);
  });
});
