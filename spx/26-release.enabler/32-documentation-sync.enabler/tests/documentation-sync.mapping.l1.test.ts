import { it } from "vitest";

import { documentationSyncMappingCases } from "@testing/harnesses/release/documentation-sync";
import { harnessTestCaseArguments, prepareHarnessTestCases } from "@testing/harnesses/vitest-registration";

it.each(prepareHarnessTestCases(documentationSyncMappingCases))(
  ...harnessTestCaseArguments(documentationSyncMappingCases),
);
