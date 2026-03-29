/**
 * Unit tests for handoff command content building.
 *
 * Test Level: 1 (Unit)
 * - Pure functions: hasFrontmatter, buildSessionContent
 * - No external dependencies
 *
 * Assertion covered from core-operations.md:
 * - S1: handoff creates file in todo/ with timestamp ID and HANDOFF_ID tag
 *   (this file covers the content-building part; CLI integration is in the
 *    integration test file)
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildSessionContent, hasFrontmatter } from "@/commands/session/handoff";
import { handoffCommand } from "@/commands/session/handoff";
import { parseSessionMetadata } from "@/session/list";
import type { SessionHarness } from "@/session/testing/harness";
import { createSessionHarness } from "@/session/testing/harness";
import { DEFAULT_PRIORITY } from "@/session/types";

describe("hasFrontmatter", () => {
  it("GIVEN content starting with --- WHEN checked THEN returns true", () => {
    const content = `---\npriority: high\n---\n# Content`;
    expect(hasFrontmatter(content)).toBe(true);
  });

  it("GIVEN content without --- at start WHEN checked THEN returns false", () => {
    expect(hasFrontmatter("# No frontmatter")).toBe(false);
  });

  it("GIVEN dashes not at start WHEN checked THEN returns false", () => {
    expect(hasFrontmatter("# Title\n---\nNot frontmatter")).toBe(false);
  });

  it("GIVEN empty content WHEN checked THEN returns false", () => {
    expect(hasFrontmatter("")).toBe(false);
  });
});

describe("buildSessionContent", () => {
  it("GIVEN content with frontmatter WHEN built THEN preserves as-is", () => {
    const content = `---\npriority: high\ntags: [feature]\n---\n# Task`;
    expect(buildSessionContent(content)).toBe(content);
  });

  it("GIVEN content without frontmatter WHEN built THEN adds default frontmatter", () => {
    const content = "# My Task\nSome details.";
    const result = buildSessionContent(content);

    expect(result).toContain("---");
    expect(result).toContain(`priority: ${DEFAULT_PRIORITY}`);
    expect(result).toContain("# My Task");
  });

  it("GIVEN empty content WHEN built THEN creates default session", () => {
    const result = buildSessionContent("");

    expect(result).toContain("---");
    expect(result).toContain(`priority: ${DEFAULT_PRIORITY}`);
  });

  it("GIVEN undefined content WHEN built THEN creates default session", () => {
    const result = buildSessionContent(undefined);

    expect(result).toContain("---");
    expect(result).toContain(`priority: ${DEFAULT_PRIORITY}`);
  });
});

describe("buildSessionContent → parseSessionMetadata roundtrip", () => {
  it("GIVEN content with metadata WHEN built then parsed THEN metadata preserved", () => {
    const content = `---\npriority: high\ntags: [refactor, cleanup]\n---\n# Task`;
    const built = buildSessionContent(content);
    const metadata = parseSessionMetadata(built);

    expect(metadata.priority).toBe("high");
    expect(metadata.tags).toEqual(["refactor", "cleanup"]);
  });

  it("GIVEN content without metadata WHEN built then parsed THEN defaults applied", () => {
    const built = buildSessionContent("# Plain task");
    const metadata = parseSessionMetadata(built);

    expect(metadata.priority).toBe(DEFAULT_PRIORITY);
    expect(metadata.tags).toEqual([]);
  });
});

describe("handoffCommand with real filesystem", () => {
  let harness: SessionHarness;

  beforeEach(async () => {
    harness = await createSessionHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("GIVEN content piped to handoff WHEN executed THEN creates file in todo with HANDOFF_ID tag", async () => {
    const content = `---\npriority: high\n---\n# Test handoff`;
    const output = await handoffCommand({
      content,
      sessionsDir: harness.sessionsDir,
    });

    expect(output).toMatch(/<HANDOFF_ID>\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}<\/HANDOFF_ID>/);
    expect(output).toMatch(/<SESSION_FILE>.*\.md<\/SESSION_FILE>/);
  });
});
