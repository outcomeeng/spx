import { describe, expect, it } from "vitest";

import { atomicJsonlPublicationObservation } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication", () => {
  it("publishes one complete record without overwriting the winner", async () => {
    expect((await atomicJsonlPublicationObservation()).actual.first).toEqual(
      (await atomicJsonlPublicationObservation()).expected.first,
    );
    expect((await atomicJsonlPublicationObservation()).actual.collision).toEqual(
      (await atomicJsonlPublicationObservation()).expected.collision,
    );
    expect((await atomicJsonlPublicationObservation()).actual.winnerContent).toEqual(
      (await atomicJsonlPublicationObservation()).expected.winnerContent,
    );
    expect((await atomicJsonlPublicationObservation()).actual.beforePublicationError).toEqual(
      (await atomicJsonlPublicationObservation()).expected.beforePublicationError,
    );
    expect((await atomicJsonlPublicationObservation()).actual.beforePublicationDestinationError).toEqual(
      (await atomicJsonlPublicationObservation()).expected.beforePublicationDestinationError,
    );
    expect((await atomicJsonlPublicationObservation()).actual.retry).toEqual(
      (await atomicJsonlPublicationObservation()).expected.retry,
    );
    expect((await atomicJsonlPublicationObservation()).actual.afterPublicationRecord).toEqual(
      (await atomicJsonlPublicationObservation()).expected.afterPublicationRecord,
    );
    expect((await atomicJsonlPublicationObservation()).actual.guarded).toEqual(
      (await atomicJsonlPublicationObservation()).expected.guarded,
    );
    expect((await atomicJsonlPublicationObservation()).actual.guardedDestinationError).toEqual(
      (await atomicJsonlPublicationObservation()).expected.guardedDestinationError,
    );
    expect((await atomicJsonlPublicationObservation()).actual.removedTemporary).toEqual(
      (await atomicJsonlPublicationObservation()).expected.removedTemporary,
    );
    expect((await atomicJsonlPublicationObservation()).actual.cleanup).toEqual(
      (await atomicJsonlPublicationObservation()).expected.cleanup,
    );
    expect((await atomicJsonlPublicationObservation()).actual.firstCleanupError).toEqual(
      (await atomicJsonlPublicationObservation()).expected.firstCleanupError,
    );
    expect((await atomicJsonlPublicationObservation()).actual.secondCleanupError).toEqual(
      (await atomicJsonlPublicationObservation()).expected.secondCleanupError,
    );
    expect((await atomicJsonlPublicationObservation()).actual.destinationContent).toEqual(
      (await atomicJsonlPublicationObservation()).expected.destinationContent,
    );
    expect((await atomicJsonlPublicationObservation()).actual.nonMatchingContent).toEqual(
      (await atomicJsonlPublicationObservation()).expected.nonMatchingContent,
    );
  });
});
