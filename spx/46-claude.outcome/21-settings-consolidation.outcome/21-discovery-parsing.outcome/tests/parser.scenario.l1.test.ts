import { parseAllSettings, parseSettingsFile } from "@/lib/claude/permissions/parser";
import {
  assertExtractsTypedPermissionRecords,
  assertReportsMalformedFileAndContinues,
} from "@testing/harnesses/claude/permissions/parser";
import { describe, test } from "vitest";

describe("settings-file parsing", () => {
  test("extracts typed permission records from valid settings", async () => {
    await assertExtractsTypedPermissionRecords(parseSettingsFile);
  });

  test("reports malformed JSON and continues parsing later files", async () => {
    await assertReportsMalformedFileAndContinues(parseAllSettings);
  });
});
