import { it } from "vitest";

import { documentationSyncScenarioCases } from "@testing/harnesses/release/documentation-sync";
import { HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase } from "@testing/harnesses/vitest-registration";

it.each([...documentationSyncScenarioCases])(HARNESS_TEST_CASE_TITLE_PATTERN, runHarnessTestCase);
