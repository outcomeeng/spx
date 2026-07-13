import { parseAllSettings } from "@/lib/claude/permissions/parser";
import { assertParsingPreservesCardinalityAndOrder } from "@testing/harnesses/claude/permissions/parser";
import { describe, test } from "vitest";

describe("settings-file parsing", () => {
  test("preserves one ordered result per input path", async () => {
    await assertParsingPreservesCardinalityAndOrder(parseAllSettings);
  });
});
