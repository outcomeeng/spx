import { it } from "vitest";

import { executionRecordingScenarioCases } from "@testing/harnesses/testing/execution-recording-scenarios";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(executionRecordingScenarioCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(executionRecordingScenarioCases),
);
