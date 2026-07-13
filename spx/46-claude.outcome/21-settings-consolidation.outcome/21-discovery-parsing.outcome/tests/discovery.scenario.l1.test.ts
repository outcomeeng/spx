import { findSettingsFiles } from "@/lib/claude/permissions/discovery";
import { assertDiscoversSettingsAtVaryingDepths } from "@testing/harnesses/claude/permissions/discovery";
import { describe, test } from "vitest";

describe("settings-file discovery", () => {
  test("finds settings files inside .claude directories at varying depths", async () => {
    await assertDiscoversSettingsAtVaryingDepths(findSettingsFiles);
  });
});
