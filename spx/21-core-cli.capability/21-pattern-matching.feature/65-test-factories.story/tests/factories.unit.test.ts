/**
 * Level 1: Pure function tests for test factories
 * Story: story-65_test-factories
 */
import { WORK_ITEM_KINDS } from "@/lib/spec-legacy/types";
import { createRandomWorkItem, createWorkItem, createWorkItemName } from "@testing/harnesses/factories";
import { describe, expect, it } from "vitest";

describe("createWorkItemName", () => {
  it("GIVEN capability parameters WHEN creating name THEN returns valid pattern", () => {
    // Given
    const kind = WORK_ITEM_KINDS[0];
    const number = 20;
    const slug = "core-cli";

    // When
    const result = createWorkItemName({ kind, number, slug });

    // Then
    expect(result).toBe("capability-21_core-cli");
  });

  it("GIVEN feature parameters WHEN creating name THEN returns valid pattern", () => {
    // Given
    const kind = WORK_ITEM_KINDS[1];
    const number = 21;
    const slug = "pattern-matching";

    // When
    const result = createWorkItemName({ kind, number, slug });

    // Then
    expect(result).toBe("feature-21_pattern-matching");
  });

  it("GIVEN story parameters WHEN creating name THEN returns valid pattern", () => {
    // Given
    const kind = WORK_ITEM_KINDS[2];
    const number = 32;
    const slug = "parse-features";

    // When
    const result = createWorkItemName({ kind, number, slug });

    // Then
    expect(result).toBe("story-32_parse-features");
  });

  it("GIVEN only kind WHEN creating name THEN uses default number and slug", () => {
    // Given
    const kind = WORK_ITEM_KINDS[0];

    // When
    const result = createWorkItemName({ kind });

    // Then
    expect(result).toMatch(/^capability-\d{2}_test-/);
  });
});

describe("createWorkItem", () => {
  it("GIVEN all parameters WHEN creating work item THEN returns complete object", () => {
    // Given
    const params = {
      kind: WORK_ITEM_KINDS[0],
      number: 20,
      slug: "core-cli",
    };

    // When
    const result = createWorkItem(params);

    // Then
    expect(result).toEqual({
      kind: WORK_ITEM_KINDS[0],
      number: 20,
      slug: "core-cli",
      path: "/test/specs/work/doing/capability-21_core-cli",
    });
  });

  it("GIVEN partial parameters WHEN creating work item THEN fills defaults", () => {
    // Given
    const params = {
      kind: WORK_ITEM_KINDS[1],
    };

    // When
    const result = createWorkItem(params);

    // Then
    expect(result.kind).toBe(WORK_ITEM_KINDS[1]);
    expect(result.number).toBeGreaterThanOrEqual(10);
    expect(result.number).toBeLessThanOrEqual(99);
    expect(result.slug).toBeDefined();
  });
});

describe("createRandomWorkItem", () => {
  it("GIVEN no parameters WHEN creating random work item THEN returns valid object", () => {
    // Given/When
    const result = createRandomWorkItem();

    // Then
    expect(result.kind).toMatch(/^(capability|feature|story)$/);
    expect(result.number).toBeGreaterThanOrEqual(10);
    expect(result.number).toBeLessThanOrEqual(99);
    expect(result.slug).toBeTruthy();
  });

  it("GIVEN multiple calls WHEN creating random work items THEN produces variety", () => {
    // Given/When
    const items = Array.from({ length: 10 }, () => createRandomWorkItem());

    // Then: At least some variation in kinds
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it("GIVEN specific kind WHEN creating random work item THEN uses that kind", () => {
    // Given
    const kind = WORK_ITEM_KINDS[2];

    // When
    const result = createRandomWorkItem({ kind });

    // Then
    expect(result.kind).toBe(WORK_ITEM_KINDS[2]);
  });
});
