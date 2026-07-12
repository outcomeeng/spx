import { describe, it } from "vitest";

import {
  assertCanonicalCheckoutFailureTranslations,
  assertEveryTranslationBranchHasHeading,
  assertInvalidSpxVersionTranslation,
  assertJsonReportPreservesSchema,
  assertMarketplaceCliProblemTranslation,
  assertSessionStartNoOpTranslation,
  assertTextReportHidesMachineFields,
  assertTextReportSummary,
  assertUnknownTranslationHidesMachineFields,
} from "@testing/harnesses/diagnose/report";

describe("the text report translates check records into a human diagnosis", () => {
  it("states the conclusion, active problems, healthy facts, and actions", assertTextReportSummary);
  it("reports an unavailable configured marketplace CLI as actionable", assertMarketplaceCliProblemTranslation);
  it("reports silent session-start no-op as a stale claim-path signal", assertSessionStartNoOpTranslation);
  it("reports invalid spx version comparison details", assertInvalidSpxVersionTranslation);
  it("hides raw booleans, machine labels, and remediation prose", assertTextReportHidesMachineFields);
  it("hides machine fields for an unsupported translation", assertUnknownTranslationHidesMachineFields);
  it("renders a diagnosis heading for every supported verdict", assertEveryTranslationBranchHasHeading);
  it("renders each canonical-checkout problem and remediation", assertCanonicalCheckoutFailureTranslations);
});

describe("the JSON report remains the complete machine schema", () => {
  it("preserves every check record field", assertJsonReportPreservesSchema);
});
