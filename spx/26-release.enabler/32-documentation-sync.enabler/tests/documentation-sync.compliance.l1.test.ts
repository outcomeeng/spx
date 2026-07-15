import { it } from "vitest";

import { documentationSyncComplianceCases } from "@testing/harnesses/release/documentation-sync";
import { HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase } from "@testing/harnesses/vitest-registration";

it.each([...documentationSyncComplianceCases])(HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase);
