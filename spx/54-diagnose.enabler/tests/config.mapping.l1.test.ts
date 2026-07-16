import { describe, expect, it } from "vitest";

import { DIAGNOSE_CONFIG_FIELDS, diagnoseConfigDescriptor } from "@/domains/diagnose/config";
import { CHECK_NAME } from "@/domains/diagnose/manifest";

describe("the diagnose config descriptor", () => {
  it("rejects an empty check set", () => {
    expect(
      diagnoseConfigDescriptor.validate({
        [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [],
      }).ok,
    ).toBe(false);
  });

  it("rejects an empty spx floor", () => {
    expect(
      diagnoseConfigDescriptor.validate({
        [DIAGNOSE_CONFIG_FIELDS.SPX_FLOOR]: "",
      }).ok,
    ).toBe(false);
  });

  it("rejects fields outside the diagnose contract", () => {
    expect(
      diagnoseConfigDescriptor.validate({
        [`${DIAGNOSE_CONFIG_FIELDS.CHECKS}.${CHECK_NAME.SPX_REACHABILITY}`]: [],
      }).ok,
    ).toBe(false);
  });

  it("resolves populated caller-overridable facts", () => {
    const result = diagnoseConfigDescriptor.validate({
      [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [CHECK_NAME.SPX_REACHABILITY],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.checks).toEqual([CHECK_NAME.SPX_REACHABILITY]);
  });

  it("resolves an absent section to empty defaults", () => {
    const result = diagnoseConfigDescriptor.validate({});

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({});
  });
});
