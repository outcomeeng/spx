/**
 * Level 1: Pure function tests for status state machine
 * Story: story-21_state-machine
 */
import { determineStatus } from "@/lib/spec-legacy/status/state";
import { WORK_ITEM_STATUSES } from "@/lib/spec-legacy/types";
import { describe, expect, it } from "vitest";

describe("determineStatus", () => {
  it("GIVEN no tests dir WHEN determining status THEN returns OPEN", () => {
    // Given
    const flags = {
      hasTestsDir: false,
      hasDoneMd: false,
      testsIsEmpty: true,
    };

    // When
    const status = determineStatus(flags);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[0]);
  });

  it("GIVEN empty tests dir WHEN determining status THEN returns OPEN", () => {
    // Given
    const flags = {
      hasTestsDir: true,
      hasDoneMd: false,
      testsIsEmpty: true,
    };

    // When
    const status = determineStatus(flags);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[0]);
  });

  it("GIVEN tests dir with files but no DONE.md WHEN determining status THEN returns IN_PROGRESS", () => {
    // Given
    const flags = {
      hasTestsDir: true,
      hasDoneMd: false,
      testsIsEmpty: false,
    };

    // When
    const status = determineStatus(flags);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[1]);
  });

  it("GIVEN tests dir with DONE.md and other files WHEN determining status THEN returns DONE", () => {
    // Given
    const flags = {
      hasTestsDir: true,
      hasDoneMd: true,
      testsIsEmpty: false,
    };

    // When
    const status = determineStatus(flags);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[2]);
  });

  it("GIVEN only DONE.md in tests dir WHEN determining status THEN returns DONE", () => {
    // Given
    const flags = {
      hasTestsDir: true,
      hasDoneMd: true,
      testsIsEmpty: true, // Only DONE.md, no other test files
    };

    // When
    const status = determineStatus(flags);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[2]);
  });
});
