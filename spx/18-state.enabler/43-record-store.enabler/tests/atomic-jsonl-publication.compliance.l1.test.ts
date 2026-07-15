import { describe, it } from "vitest";

import { assertAtomicJsonlPublicationCompliance } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication", () => {
  it("publishes one complete record without overwriting the winner", async () => {
    await assertAtomicJsonlPublicationCompliance();
  });
});
