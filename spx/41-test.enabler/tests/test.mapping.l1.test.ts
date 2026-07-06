import { it } from "vitest";

import { testMappingCases } from "@testing/harnesses/testing/test-mapping";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(testMappingCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(testMappingCases),
);
