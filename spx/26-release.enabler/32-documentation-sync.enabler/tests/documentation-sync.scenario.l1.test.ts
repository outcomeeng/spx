import { it } from "vitest";

import { documentationSyncScenarioCases } from "@testing/harnesses/release/documentation-sync";
import { harnessTestCaseArguments, prepareHarnessTestCases } from "@testing/harnesses/vitest-registration";

it.each(prepareHarnessTestCases(documentationSyncScenarioCases))(
  ...harnessTestCaseArguments(documentationSyncScenarioCases),
);
