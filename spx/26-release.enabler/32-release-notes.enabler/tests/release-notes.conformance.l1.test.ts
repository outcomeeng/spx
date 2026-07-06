import { it } from "vitest";

import { releaseNotesConformanceCases } from "@testing/harnesses/release/release-notes-conformance";
import {
  HARNESS_TEST_TITLE_PATTERN,
  maxHarnessTestCaseTimeout,
  runHarnessTestCase,
} from "@testing/harnesses/vitest-registration";

it.each(releaseNotesConformanceCases)(
  HARNESS_TEST_TITLE_PATTERN,
  runHarnessTestCase,
  maxHarnessTestCaseTimeout(releaseNotesConformanceCases),
);
