import { describe, it } from "vitest";

import { assertAtomicJsonlPublicationMapping } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication mappings", () => {
  it("maps interruption and barriers to their publication outcomes", assertAtomicJsonlPublicationMapping);
});
