import { describe, expect, it } from "vitest";

import { ERROR_CODE_NOT_FOUND, STATE_STORE_ERROR } from "@/lib/state-store";
import { atomicJsonlPublicationObservation } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication", () => {
  it("publishes one complete record without overwriting the winner", async () => {
    const observation = await atomicJsonlPublicationObservation();

    expect(observation.actual.first).toEqual({ ok: true, value: observation.paths.atomicRecord });
    expect(observation.actual.collision).toEqual({ ok: false, error: STATE_STORE_ERROR.RECORD_ALREADY_EXISTS });
    expect(observation.actual.winnerContent).toBe(`${JSON.stringify(observation.firstRecord)}\n`);
    expect(observation.actual.beforePublicationError).toBe(STATE_STORE_ERROR.RECORD_WRITE_FAILED);
    expect(observation.actual.beforePublicationDestinationError).toBe(ERROR_CODE_NOT_FOUND);
    expect(observation.actual.retry).toEqual({ ok: true, value: observation.paths.prePublicationRecord });
    expect(observation.actual.afterPublicationRecord).toEqual({ ok: true, value: observation.secondRecord });
    expect(observation.actual.guarded).toEqual({
      ok: false,
      error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED,
    });
    expect(observation.actual.guardedDestinationError).toBe(ERROR_CODE_NOT_FOUND);
    expect(observation.actual.removedTemporary).toEqual({
      ok: false,
      error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED,
    });
    expect(observation.actual.cleanup).toEqual({ ok: true, value: 2 });
    expect(observation.actual.firstCleanupError).toBe(ERROR_CODE_NOT_FOUND);
    expect(observation.actual.secondCleanupError).toBe(ERROR_CODE_NOT_FOUND);
    expect(observation.actual.destinationContent).toBe(observation.preservedContent.destination);
    expect(observation.actual.nonMatchingContent).toBe(observation.preservedContent.nonMatching);
  });
});
