import {
  assertConsolidatePreview,
  assertConsolidateReportsNoSettings,
  assertConsolidateWritesGlobalSettingsAndBackup,
  assertConsolidateWritesOutputFile,
} from "@testing/harnesses/claude/permissions/consolidate-cli";
import { describe, it } from "vitest";

describe("spx claude settings consolidate", () => {
  it("displays the merged result in preview mode without modifying files", async () => {
    await assertConsolidatePreview();
  });

  it("writes merged settings and creates a backup", async () => {
    await assertConsolidateWritesGlobalSettingsAndBackup();
  });

  it("writes merged settings to an output file and preserves global settings", async () => {
    await assertConsolidateWritesOutputFile();
  });

  it("reports when the scan root contains no local settings files", async () => {
    await assertConsolidateReportsNoSettings();
  });
});
