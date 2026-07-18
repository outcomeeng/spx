import { describe, it } from "vitest";

import { assertAtomicJsonlPublicationCollisionProperty } from "@testing/harnesses/state/atomic-jsonl-publication";

describe("record store — atomic JSONL publication property", () => {
  it(
    "commits exactly one complete record for every generated collision",
    assertAtomicJsonlPublicationCollisionProperty,
  );
});
