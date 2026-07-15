import { it } from "vitest";

import { documentationSyncPropertyCases } from "@testing/harnesses/release/documentation-sync";
import { harnessTestCaseArguments, prepareHarnessTestCases } from "@testing/harnesses/vitest-registration";

it.each(prepareHarnessTestCases(documentationSyncPropertyCases))(
  ...harnessTestCaseArguments(documentationSyncPropertyCases),
);
