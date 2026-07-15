import { describe, it } from "vitest";

import { SOURCE_OWNERSHIP_CLASSIFICATION } from "@/outcomeeng/spec-tree/graph/source";
import { assertOwnershipClassificationMappingFor } from "@testing/harnesses/outcomeeng/source-graph";

describe("source artifact ownership classification", () => {
  it.each(Object.values(SOURCE_OWNERSHIP_CLASSIFICATION))(
    "maps provider facts and linked tests to %s",
    (classification) => {
      assertOwnershipClassificationMappingFor(classification);
    },
  );
});
