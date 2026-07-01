import { describe, expect, it } from "vitest";

import { CLI_PATH, PRODUCT_ROOT } from "@testing/harnesses/constants";

describe("CLI subprocess test harness compliance", () => {
  it("targets the packaged executable under the product root", () => {
    expect(CLI_PATH.startsWith(PRODUCT_ROOT)).toBe(true);
    expect(CLI_PATH).toMatch(/bin\/spx\.js$/u);
    expect(CLI_PATH).not.toMatch(/src\/cli\.ts$/u);
  });
});
