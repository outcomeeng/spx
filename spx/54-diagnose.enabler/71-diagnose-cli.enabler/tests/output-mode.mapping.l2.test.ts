import { describe, it } from "vitest";

import {
  assertOutputSelectorCase,
  assertPresentationModesPreserveDiagnosis,
  DIAGNOSE_OUTPUT_SELECTOR_CASES,
} from "@testing/harnesses/diagnose/cli";

describe("spx diagnose output selection", () => {
  it.each(DIAGNOSE_OUTPUT_SELECTOR_CASES)("maps the $name selector", assertOutputSelectorCase);
  it("preserves provider execution and diagnosis across presentation modes", assertPresentationModesPreserveDiagnosis);
});
