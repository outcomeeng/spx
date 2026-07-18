import { describe, expect, it } from "vitest";

import { atomicJsonlPublicationObservation } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication", () => {
  it("removes only publication-owned temporary siblings", async () => {
    expect((await atomicJsonlPublicationObservation()).actual.cleanup).toEqual({ ok: true, value: 2 });
    expect((await atomicJsonlPublicationObservation()).actual.cleanupAfterRemoval).toEqual({ ok: true, value: 0 });
    expect((await atomicJsonlPublicationObservation()).actual.destinationContent).toBe(
      (await atomicJsonlPublicationObservation()).fixture.content.destination,
    );
    expect((await atomicJsonlPublicationObservation()).actual.nonMatchingContent).toBe(
      (await atomicJsonlPublicationObservation()).fixture.content.nonMatching,
    );
  });
});
