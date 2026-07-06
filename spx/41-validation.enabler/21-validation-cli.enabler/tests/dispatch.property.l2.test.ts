import { it } from "vitest";

import { validationCliPropertyCases } from "@testing/harnesses/validation/cli-properties";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(validationCliPropertyCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(validationCliPropertyCases),
);
