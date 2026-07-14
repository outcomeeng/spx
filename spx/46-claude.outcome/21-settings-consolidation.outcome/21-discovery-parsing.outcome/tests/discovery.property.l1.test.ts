import { findSettingsFiles } from "@/commands/claude/settings/discovery";
import { assertDiscoveryIsExhaustive } from "@testing/harnesses/claude/permissions/discovery";
import { describe, test } from "vitest";

describe("settings-file discovery", () => {
  test("finds every settings file under the root", async () => {
    await assertDiscoveryIsExhaustive(findSettingsFiles);
  });
});
