import { describe, expect, it } from "vitest";

import { atomicJsonlPublicationObservation } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication", () => {
  it("publishes one complete record without overwriting the winner", async () => {
    expect((await atomicJsonlPublicationObservation()).actual).toEqual(
      (await atomicJsonlPublicationObservation()).expected,
    );
  });
});
