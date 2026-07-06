import { it } from "vitest";

import { validationCliScenarioCases } from "@testing/harnesses/validation/cli-scenarios";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(validationCliScenarioCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(validationCliScenarioCases),
);
