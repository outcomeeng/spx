import { mergePermissions } from "@/domains/claude/settings/merger";
import { assertMergeIsCommutative, assertMergeIsDeterministic } from "@testing/harnesses/claude/permissions/merger";
import { describe, test } from "vitest";

describe("permission merging properties", () => {
  test("the same inputs produce the same output", () => {
    assertMergeIsDeterministic(mergePermissions);
  });

  test("local input order does not affect the output", () => {
    assertMergeIsCommutative(mergePermissions);
  });
});
