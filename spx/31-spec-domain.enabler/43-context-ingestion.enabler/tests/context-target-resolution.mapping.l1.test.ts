import { describe, it } from "vitest";

import {
  specContextTargetDiagnosticSafetyCases,
  specContextTargetMappingCases,
} from "@testing/generators/spec-tree/context-target";
import {
  assertSpecContextTargetDiagnosticSafetyCase,
  assertSpecContextTargetMappingCase,
} from "@testing/harnesses/spec/context";

describe("spec context target resolution mapping", () => {
  it.each(specContextTargetMappingCases())("$title", assertSpecContextTargetMappingCase);
  it.each(specContextTargetDiagnosticSafetyCases())("$title", assertSpecContextTargetDiagnosticSafetyCase);
});
