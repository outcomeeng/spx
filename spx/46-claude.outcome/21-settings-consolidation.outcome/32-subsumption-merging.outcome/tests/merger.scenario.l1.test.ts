import { mergePermissions } from "@/domains/claude/settings/merger";
import {
  assertDenyTakesPrecedence,
  assertMergeIsExactUnionWithoutConflicts,
} from "@testing/harnesses/claude/permissions/merger";
import { describe, test } from "vitest";

describe("permission merging scenarios", () => {
  test("non-conflicting permission sets produce their exact union", () => {
    assertMergeIsExactUnionWithoutConflicts(mergePermissions);
  });

  test("deny takes precedence over an exact allow", () => {
    assertDenyTakesPrecedence(mergePermissions);
  });
});
