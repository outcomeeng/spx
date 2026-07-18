import { describe, expect, it } from "vitest";

import { ERROR_CODE_NOT_FOUND, STATE_STORE_ERROR } from "@/lib/state-store";
import { atomicJsonlPublicationObservation } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication mappings", () => {
  it("maps interruption and barriers to their publication outcomes", async () => {
    expect((await atomicJsonlPublicationObservation()).actual.beforePublicationError).toBe(
      STATE_STORE_ERROR.RECORD_WRITE_FAILED,
    );
    expect((await atomicJsonlPublicationObservation()).actual.beforePublicationDestinationError).toBe(
      ERROR_CODE_NOT_FOUND,
    );
    expect((await atomicJsonlPublicationObservation()).actual.retry).toEqual({
      ok: true,
      value: (await atomicJsonlPublicationObservation()).fixture.paths.prePublicationRecord,
    });
    expect((await atomicJsonlPublicationObservation()).actual.afterPublicationRecord).toEqual({
      ok: true,
      value: (await atomicJsonlPublicationObservation()).secondRecord,
    });
    expect((await atomicJsonlPublicationObservation()).actual.afterPublicationResult).toEqual({
      ok: true,
      value: (await atomicJsonlPublicationObservation()).fixture.paths.postPublicationRecord,
    });
    expect((await atomicJsonlPublicationObservation()).actual.guarded).toEqual({
      ok: false,
      error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED,
    });
    expect((await atomicJsonlPublicationObservation()).actual.guardedDestinationError).toBe(ERROR_CODE_NOT_FOUND);
    expect((await atomicJsonlPublicationObservation()).actual.removedTemporary).toEqual({
      ok: false,
      error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED,
    });
    expect((await atomicJsonlPublicationObservation()).actual.removedTemporaryDestinationError).toBe(
      ERROR_CODE_NOT_FOUND,
    );
  });
});
