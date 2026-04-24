/**
 * Level 2: Integration tests for complete status determination
 * Story: story-54_status-edge-cases
 */
import { getWorkItemStatus, StatusDeterminationError } from "@/status/state";
import { WORK_ITEM_STATUSES } from "@/types";
import { CLI_TIMEOUTS_MS, FIXTURES_ROOT } from "@test/harness/constants";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("getWorkItemStatus", () => {
  /**
   * Level 2: Integration tests for complete status determination
   * Story: story-54_status-edge-cases
   */

  it("GIVEN work item with no tests dir WHEN getting status THEN returns OPEN", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/no-tests");

    // When
    const status = await getWorkItemStatus(workItemPath);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[0]);
  });

  it("GIVEN work item with tests but no DONE.md WHEN getting status THEN returns IN_PROGRESS", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/in-progress");

    // When
    const status = await getWorkItemStatus(workItemPath);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[1]);
  });

  it("GIVEN work item with DONE.md WHEN getting status THEN returns DONE", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/done-item");

    // When
    const status = await getWorkItemStatus(workItemPath);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[2]);
  });

  it("GIVEN work item with empty tests dir WHEN getting status THEN returns OPEN", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/empty-tests");

    // When
    const status = await getWorkItemStatus(workItemPath);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[0]);
  });

  it("GIVEN work item with only DONE.md WHEN getting status THEN returns DONE", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/only-done");

    // When
    const status = await getWorkItemStatus(workItemPath);

    // Then
    expect(status).toBe(WORK_ITEM_STATUSES[2]);
  });

  it("GIVEN work item with DONE.md as directory WHEN getting status THEN returns IN_PROGRESS", async () => {
    // Given: DONE.md exists but is a directory (not a file)
    const workItemPath = join(FIXTURES_ROOT, "work-items/done-is-dir");

    // When
    const status = await getWorkItemStatus(workItemPath);

    // Then: Should treat as no DONE.md
    expect(status).toBe(WORK_ITEM_STATUSES[1]);
  });

  it("GIVEN non-existent work item WHEN getting status THEN throws StatusDeterminationError", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/does-not-exist");

    // When/Then
    await expect(getWorkItemStatus(workItemPath)).rejects.toThrow(
      StatusDeterminationError,
    );
    await expect(getWorkItemStatus(workItemPath)).rejects.toThrow(
      /Failed to determine status/,
    );
  });
});

describe("Status determination performance", () => {
  it("GIVEN work item WHEN getting status multiple times THEN completes quickly", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/done-item");

    // When: Measure multiple calls
    const iterations = 10;
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await getWorkItemStatus(workItemPath);
    }
    const elapsed = Date.now() - start;
    const avgTime = elapsed / iterations;

    // Then: Average should be well under 5ms per call
    // Note: This is a rough check, not a precise benchmark
    expect(avgTime).toBeLessThan(CLI_TIMEOUTS_MS.STATUS_CHECK_AVG);
  });
});
