import { describe, it } from "vitest";

import { INVALID_DIAGNOSE_REPORT_CASES } from "@testing/generators/diagnose/report-scenarios";
import {
  assertInvalidDiagnoseReportRejected,
  assertJsonReportPreservesSchema,
} from "@testing/harnesses/diagnose/report";

describe("the JSON report conforms to the runtime report schema", () => {
  it("round-trips generated valid reports", assertJsonReportPreservesSchema);
  it.each(INVALID_DIAGNOSE_REPORT_CASES)("rejects $name", assertInvalidDiagnoseReportRejected);
});
