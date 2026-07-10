import { it } from "vitest";

import { changedSetPlanningScenarioCases } from "@testing/harnesses/testing/changed-set-planning-scenarios";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  requireNonEmptyHarnessTestCases,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

const cases = requireNonEmptyHarnessTestCases(changedSetPlanningScenarioCases);

it.each(cases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(cases),
);
