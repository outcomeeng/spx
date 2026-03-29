/**
 * Unit tests for session show formatting.
 *
 * Test Level: 1 (Unit)
 * - Pure functions: formatShowOutput, resolveSessionPaths
 * - No external dependencies
 *
 * Assertion covered from core-operations.md:
 * - S5: show prints content with metadata header
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_SESSION_CONFIG, formatShowOutput, resolveSessionPaths, SEARCH_ORDER } from "@/session/show";
import { SESSION_STATUSES } from "@/session/types";

describe("formatShowOutput", () => {
  it("GIVEN session content WHEN formatted THEN includes status from SESSION_STATUSES", () => {
    const content = `---\npriority: high\n---\n# Content`;

    for (const status of SESSION_STATUSES) {
      const result = formatShowOutput(content, { status });
      expect(result).toContain(`Status: ${status}`);
    }
  });

  it("GIVEN session with priority WHEN formatted THEN includes priority", () => {
    const content = `---\npriority: high\n---\n# Content`;
    const result = formatShowOutput(content, { status: SESSION_STATUSES[0] });

    expect(result).toContain("Priority: high");
  });

  it("GIVEN session with full metadata WHEN formatted THEN includes all fields", () => {
    const content =
      `---\nid: test-session\npriority: high\nbranch: feature/test\ntags: [bug, urgent]\ncreated_at: 2026-01-13T10:00:00Z\n---\n# Content`;
    const result = formatShowOutput(content, { status: SESSION_STATUSES[1] });

    expect(result).toContain("ID: test-session");
    expect(result).toContain(`Status: ${SESSION_STATUSES[1]}`);
    expect(result).toContain("Priority: high");
    expect(result).toContain("Branch: feature/test");
    expect(result).toContain("Tags: bug, urgent");
    expect(result).toContain("Created: 2026-01-13T10:00:00Z");
  });

  it("GIVEN session content WHEN formatted THEN preserves original content", () => {
    const content = `---\npriority: medium\n---\n# Original Content\nPreserved.`;
    const result = formatShowOutput(content, { status: SESSION_STATUSES[2] });

    expect(result).toContain("# Original Content");
    expect(result).toContain("Preserved.");
  });

  it("GIVEN session without frontmatter WHEN formatted THEN uses defaults", () => {
    const content = "# Just Content\nNo metadata.";
    const result = formatShowOutput(content, { status: SESSION_STATUSES[0] });

    expect(result).toContain("Priority: medium");
    expect(result).toContain(`Status: ${SESSION_STATUSES[0]}`);
    expect(result).toContain("# Just Content");
  });

  it("GIVEN output WHEN inspected THEN has separator between metadata and content", () => {
    const content = `---\npriority: low\n---\n# Content`;
    const result = formatShowOutput(content, { status: SESSION_STATUSES[0] });

    expect(result).toContain("\u2500"); // Unicode box drawing character
  });
});

describe("resolveSessionPaths", () => {
  it("GIVEN session ID WHEN resolved THEN returns one path per SESSION_STATUSES member", () => {
    const result = resolveSessionPaths("2026-01-13_08-01-05", DEFAULT_SESSION_CONFIG);

    expect(result).toHaveLength(SESSION_STATUSES.length);
  });

  it("GIVEN result WHEN checked THEN path order matches SEARCH_ORDER", () => {
    const result = resolveSessionPaths("test-id", DEFAULT_SESSION_CONFIG);

    for (let i = 0; i < SEARCH_ORDER.length; i++) {
      expect(result[i]).toContain(SEARCH_ORDER[i]);
    }
  });
});

describe("SEARCH_ORDER", () => {
  it("GIVEN SEARCH_ORDER WHEN checked THEN contains every SESSION_STATUSES member", () => {
    for (const status of SESSION_STATUSES) {
      expect(SEARCH_ORDER).toContain(status);
    }
  });

  it("GIVEN SEARCH_ORDER WHEN checked THEN length matches SESSION_STATUSES", () => {
    expect(SEARCH_ORDER).toHaveLength(SESSION_STATUSES.length);
  });
});

describe("DEFAULT_SESSION_CONFIG", () => {
  it("GIVEN default config WHEN checked THEN all dirs contain sessions path", () => {
    expect(DEFAULT_SESSION_CONFIG.todoDir).toContain("sessions");
    expect(DEFAULT_SESSION_CONFIG.doingDir).toContain("sessions");
    expect(DEFAULT_SESSION_CONFIG.archiveDir).toContain("sessions");
  });
});
