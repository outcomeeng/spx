import { it } from "vitest";

import { documentationSyncPropertyCases } from "@testing/harnesses/release/documentation-sync";
import {
  groupHarnessTestCases,
  HARNESS_TEST_CASE_TITLE_PATTERN,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

for (const group of groupHarnessTestCases(documentationSyncPropertyCases)) {
  it.each([...group.testCases])(HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase, group.timeout);
}
