import { it } from "vitest";

import { changedSetPlanningScenarioCases } from "@testing/harnesses/testing/changed-set-planning-scenarios";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(changedSetPlanningScenarioCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(changedSetPlanningScenarioCases),
);
