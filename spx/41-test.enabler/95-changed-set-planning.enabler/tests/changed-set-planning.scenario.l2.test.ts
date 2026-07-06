import { it } from "vitest";

import { changedSetPlanningCommandCases } from "@testing/harnesses/testing/changed-set-planning-command";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(changedSetPlanningCommandCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(changedSetPlanningCommandCases),
);
