import { it } from "vitest";

import { releaseNotesComplianceCases } from "@testing/harnesses/release/release-notes-compliance";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(releaseNotesComplianceCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(releaseNotesComplianceCases),
);
