import { describe, it } from "vitest";

import { assertAtomicJsonlPublicationCompliance } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication", () => {
  it("removes only publication-owned temporary siblings", assertAtomicJsonlPublicationCompliance);
});
