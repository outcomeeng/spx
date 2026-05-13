import { expect } from "vitest";

export function expectPresent<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  if (value === undefined || value === null) {
    throw new Error("Expected spec-tree test value to be present");
  }
  return value;
}
