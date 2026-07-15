import { it } from "vitest";

import { documentationSyncMappingCases } from "@testing/harnesses/release/documentation-sync";
import {
  groupHarnessTestCases,
  HARNESS_TEST_CASE_TITLE_PATTERN,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

for (const group of groupHarnessTestCases(documentationSyncMappingCases)) {
  it.each([...group.testCases])(HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase, group.timeout);
}
