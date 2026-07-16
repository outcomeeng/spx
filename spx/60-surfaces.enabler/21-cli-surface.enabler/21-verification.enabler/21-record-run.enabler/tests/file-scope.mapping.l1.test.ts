import { describe, expect, it } from "vitest";

import { VERIFY_SCOPE_SEPARATOR, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import { arbitrarySafeFileScopeIdentity, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { recordVerifyStartOptions } from "@testing/harnesses/verify/harness";

describe("record-run scope option mapping", () => {
  it("passes file selectors through the caller-driven command path", async () => {
    await assertProperty(
      arbitrarySafeFileScopeIdentity(),
      async (path) => {
        expect(await recordVerifyStartOptions(VERIFY_SCOPE_TYPE.FILE, path)).toMatchObject([{
          scopeType: VERIFY_SCOPE_TYPE.FILE,
          scope: path,
        }]);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("passes changeset selectors through the same scope options", async () => {
    await assertProperty(
      VERIFY_TEST_GENERATOR.changesetRange(),
      async (range) => {
        expect(
          await recordVerifyStartOptions(
            VERIFY_SCOPE_TYPE.CHANGESET,
            `${range.base}${VERIFY_SCOPE_SEPARATOR}${range.head}`,
          ),
        ).toMatchObject([{
          scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
          scope: `${range.base}${VERIFY_SCOPE_SEPARATOR}${range.head}`,
        }]);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
