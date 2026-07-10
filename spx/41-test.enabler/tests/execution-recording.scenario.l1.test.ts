import { it } from "vitest";

import { executionRecordingScenarioCases } from "@testing/harnesses/testing/execution-recording-scenarios";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  requireNonEmptyHarnessTestCases,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

const cases = requireNonEmptyHarnessTestCases(executionRecordingScenarioCases);

it.each(cases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(cases),
);
