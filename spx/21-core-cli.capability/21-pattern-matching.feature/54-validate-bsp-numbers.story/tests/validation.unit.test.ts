/**
 * Level 1: Pure function tests for BSP number validation
 * Story: story-54_validate-bsp-numbers
 */
import { isValidBSPNumber, validateBSPNumber } from "@/scanner/validation";
import { describe, expect, it } from "vitest";

describe("isValidBSPNumber", () => {
  it("GIVEN number 10 WHEN validating THEN returns true", () => {
    // Given/When
    const result = isValidBSPNumber(10);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN number 99 WHEN validating THEN returns true", () => {
    // Given/When
    const result = isValidBSPNumber(99);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN number 50 WHEN validating THEN returns true", () => {
    // Given/When
    const result = isValidBSPNumber(50);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN number 9 WHEN validating THEN returns false", () => {
    // Given/When
    const result = isValidBSPNumber(9);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN number 100 WHEN validating THEN returns false", () => {
    // Given/When
    const result = isValidBSPNumber(100);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN number 0 WHEN validating THEN returns false", () => {
    // Given/When
    const result = isValidBSPNumber(0);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN negative number WHEN validating THEN returns false", () => {
    // Given/When
    const result = isValidBSPNumber(-1);

    // Then
    expect(result).toBe(false);
  });
});

describe("validateBSPNumber", () => {
  it("GIVEN valid BSP number WHEN validating THEN returns number", () => {
    // Given
    const number = 20;

    // When
    const result = validateBSPNumber(number);

    // Then
    expect(result).toBe(20);
  });

  it("GIVEN number too low WHEN validating THEN throws descriptive error", () => {
    // Given
    const number = 5;

    // When/Then
    expect(() => validateBSPNumber(number)).toThrow("BSP number must be between 10 and 99, got 5");
  });

  it("GIVEN number too high WHEN validating THEN throws descriptive error", () => {
    // Given
    const number = 100;

    // When/Then
    expect(() => validateBSPNumber(number)).toThrow("BSP number must be between 10 and 99, got 100");
  });
});
