import { it } from "vitest";

import { documentationSyncComplianceCases } from "@testing/harnesses/release/documentation-sync";
import {
  groupHarnessTestCases,
  HARNESS_TEST_CASE_TITLE_PATTERN,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

for (const group of groupHarnessTestCases(documentationSyncComplianceCases)) {
  it.each([...group.testCases])(HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase, group.timeout);
}
