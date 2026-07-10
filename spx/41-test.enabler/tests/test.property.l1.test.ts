import { it } from "vitest";

import { testPropertyCases } from "@testing/harnesses/testing/test-properties";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  requireNonEmptyHarnessTestCases,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

const cases = requireNonEmptyHarnessTestCases(testPropertyCases);

it.each(cases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(cases),
);
