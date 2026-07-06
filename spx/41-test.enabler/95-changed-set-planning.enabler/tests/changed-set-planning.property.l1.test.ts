import { it } from "vitest";

import { changedSetPlanningPropertyCases } from "@testing/harnesses/testing/changed-set-planning-properties";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(changedSetPlanningPropertyCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(changedSetPlanningPropertyCases),
);
