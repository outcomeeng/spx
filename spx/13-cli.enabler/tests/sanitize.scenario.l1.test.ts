import { describe, expect, it } from "vitest";

import {
  nonStringSentinel,
  sanitizeCliArgument,
  SENTINEL_EMPTY,
  SENTINEL_NULL,
  SENTINEL_UNDEFINED,
} from "@/lib/sanitize-cli-argument";

describe("sanitizeCliArgument edge-case inputs map to exported sentinels", () => {
  it("returns SENTINEL_UNDEFINED when input is undefined", () => {
    expect(sanitizeCliArgument(undefined)).toBe(SENTINEL_UNDEFINED);
  });

  it("returns SENTINEL_NULL when input is null", () => {
    expect(sanitizeCliArgument(null)).toBe(SENTINEL_NULL);
  });

  it("returns SENTINEL_EMPTY when input is the empty string", () => {
    expect(sanitizeCliArgument("")).toBe(SENTINEL_EMPTY);
  });

  it("returns nonStringSentinel(typeof value) for a non-string value", () => {
    const value = 42;
    expect(sanitizeCliArgument(value)).toBe(nonStringSentinel(typeof value));
  });
});
