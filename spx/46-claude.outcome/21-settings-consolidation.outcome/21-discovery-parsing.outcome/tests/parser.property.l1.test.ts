import { parseAllSettings, parseSettingsFile } from "@/commands/claude/settings/parser";
import {
  assertExtractsTypedPermissionRecords,
  assertParsingPreservesCardinalityAndOrder,
  assertReportsMalformedFileAndContinues,
} from "@testing/harnesses/claude/permissions/parser";
import { describe, test } from "vitest";

describe("settings-file parsing", () => {
  test("maps every valid permission entry to a typed record", async () => {
    await assertExtractsTypedPermissionRecords(parseSettingsFile);
  });

  test("retains malformed-file errors and continues with later paths", async () => {
    await assertReportsMalformedFileAndContinues(parseAllSettings);
  });

  test("preserves one ordered result per input path", async () => {
    await assertParsingPreservesCardinalityAndOrder(parseAllSettings);
  });
});
