import { it } from "vitest";

import { documentationSyncComplianceCases } from "@testing/harnesses/release/documentation-sync";
import { harnessTestCaseArguments, prepareHarnessTestCases } from "@testing/harnesses/vitest-registration";

it.each(prepareHarnessTestCases(documentationSyncComplianceCases))(
  ...harnessTestCaseArguments(documentationSyncComplianceCases),
);
