import { describe, expect, it } from "vitest";

import { verifyRenderCommand } from "@/commands/verify/cli";
import { REVIEW_PAYLOAD_FIELD, VERIFY_APPEND_EVENT_FIELD, VERIFY_APPEND_EVENT_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  assertReviewCommentProjectionIncludesFindingPayload,
  parseRenderReport,
  reviewAppendScenario,
  verifyRenderOptions,
} from "@testing/harnesses/verify/harness";

describe("review comment projection", () => {
  it("maps a review finding payload into the rendered run projection", async () => {
    await assertReviewCommentProjectionIncludesFindingPayload();
  });

  it("maps an unanchored comment without anchor fields and a changeset-wide comment without a path", async () => {
    const { scenario, deps, runToken } = await reviewAppendScenario();
    const [pathed, pathless] = await appendFindingBatch(
      scenario,
      deps,
      runToken,
      sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unanchoredReviewFindingBatch()),
    );
    const report = parseRenderReport(
      (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
    );
    const payloads = report.events
      .filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)
      .map((event) => (event.data as Record<string, Record<string, unknown>>)[VERIFY_APPEND_EVENT_FIELD.PAYLOAD]);
    expect(payloads).toEqual([pathed.finding, pathless.finding]);
    for (
      const field of [
        REVIEW_PAYLOAD_FIELD.SIDE,
        REVIEW_PAYLOAD_FIELD.LINE,
        REVIEW_PAYLOAD_FIELD.POSITION,
        REVIEW_PAYLOAD_FIELD.DIFF_HUNK,
      ]
    ) {
      expect(Object.keys(payloads[0])).not.toContain(field);
      expect(Object.keys(payloads[1])).not.toContain(field);
    }
    expect(Object.keys(payloads[0])).toContain(REVIEW_PAYLOAD_FIELD.PATH);
    expect(Object.keys(payloads[1])).not.toContain(REVIEW_PAYLOAD_FIELD.PATH);
  });
});
