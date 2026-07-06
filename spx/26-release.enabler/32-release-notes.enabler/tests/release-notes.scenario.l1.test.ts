import { it } from "vitest";

import { releaseNotesScenarioCases } from "@testing/harnesses/release/release-notes-scenarios";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(releaseNotesScenarioCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(releaseNotesScenarioCases),
);
