import { describe, it } from "vitest";

import { assertSingleArtifactRunFilePath } from "@testing/harnesses/state/record-store";

describe("record store run path", () => {
  it("builds a single-artifact run file under runs/run-{run-token}.jsonl", assertSingleArtifactRunFilePath);
});
