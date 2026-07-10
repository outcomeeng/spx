import { it } from "vitest";

import { validationCliPropertyCases } from "@testing/harnesses/validation/cli-properties";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  requireNonEmptyHarnessTestCases,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

const cases = requireNonEmptyHarnessTestCases(validationCliPropertyCases);

it.each(cases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(cases),
);
