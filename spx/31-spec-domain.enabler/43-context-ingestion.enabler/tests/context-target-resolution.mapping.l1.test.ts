import { describe, it } from "vitest";

import { specContextTargetMappingCases } from "@testing/generators/spec-tree/context-target";
import { assertSpecContextTargetMappingCase } from "@testing/harnesses/spec/context";

describe("spec context target resolution mapping", () => {
  it.each(specContextTargetMappingCases())("$title", assertSpecContextTargetMappingCase);
});
