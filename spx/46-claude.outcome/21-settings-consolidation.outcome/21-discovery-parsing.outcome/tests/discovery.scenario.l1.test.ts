import { findSettingsFiles } from "@/commands/claude/settings/discovery";
import {
  assertDiscoversSettingsAtVaryingDepths,
  assertDiscoveryRejectsInvalidRoots,
  assertDiscoveryReturnsOnlyExactTargets,
} from "@testing/harnesses/claude/permissions/discovery";
import { describe, test } from "vitest";

describe("settings-file discovery", () => {
  test("finds settings files inside .claude directories at varying depths", async () => {
    await assertDiscoversSettingsAtVaryingDepths(findSettingsFiles);
  });

  test("rejects missing and non-directory roots with path-specific diagnostics", async () => {
    await assertDiscoveryRejectsInvalidRoots(findSettingsFiles);
  });

  test("returns only exact .claude/settings.local.json targets", async () => {
    await assertDiscoveryReturnsOnlyExactTargets(findSettingsFiles);
  });
});
