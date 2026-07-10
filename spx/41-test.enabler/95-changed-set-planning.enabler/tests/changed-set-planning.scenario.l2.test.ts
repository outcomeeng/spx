import { it } from "vitest";

import { changedSetPlanningCommandCases } from "@testing/harnesses/testing/changed-set-planning-command";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  requireNonEmptyHarnessTestCases,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

const cases = requireNonEmptyHarnessTestCases(changedSetPlanningCommandCases);

it.each(cases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(cases),
);
