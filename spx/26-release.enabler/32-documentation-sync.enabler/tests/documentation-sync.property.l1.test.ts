import { it } from "vitest";

import { documentationSyncPropertyCases } from "@testing/harnesses/release/documentation-sync";
import { HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase } from "@testing/harnesses/vitest-registration";

it.each([...documentationSyncPropertyCases])(HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase);
