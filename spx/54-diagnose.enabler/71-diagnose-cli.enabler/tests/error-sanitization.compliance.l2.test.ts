import { describe, it } from "vitest";

import {
  assertInvalidOutputOptionsRejectBeforeDiagnosis,
  assertManifestCheckErrorIsSanitized,
  assertManifestPathErrorIsSanitized,
} from "@testing/harnesses/diagnose/cli";

describe("spx diagnose option and error compliance", () => {
  it(
    "rejects removed or conflicting output selectors before diagnosis",
    assertInvalidOutputOptionsRejectBeforeDiagnosis,
  );
  it("sanitizes a manifest path echoed in an error", assertManifestPathErrorIsSanitized);
  it("sanitizes a manifest check echoed in an error", assertManifestCheckErrorIsSanitized);
});
