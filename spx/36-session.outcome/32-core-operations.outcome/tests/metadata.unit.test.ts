/**
 * Unit tests for session metadata parsing.
 *
 * Test Level: 1 (Unit)
 * - Pure function: parseSessionMetadata
 * - Property-based tests mandatory (parser)
 *
 * Assertion covered from core-operations.md:
 * - P2: Session content without YAML front matter receives default front matter with medium priority
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseSessionMetadata } from "@/session/list";
import { DEFAULT_PRIORITY, type SessionPriority } from "@/session/types";

/** Valid priorities derived from the type, not hardcoded. */
const VALID_PRIORITIES: readonly SessionPriority[] = ["high", "medium", "low"] as const;

describe("parseSessionMetadata", () => {
  it("GIVEN YAML front matter with priority and tags WHEN parsed THEN extracts all fields", () => {
    const content = `---\nid: test\npriority: high\ntags: [bug, urgent]\n---\n# Content`;
    const result = parseSessionMetadata(content);

    expect(result.id).toBe("test");
    expect(result.priority).toBe("high");
    expect(result.tags).toEqual(["bug", "urgent"]);
  });

  it("GIVEN no front matter WHEN parsed THEN returns DEFAULT_PRIORITY and empty tags", () => {
    const result = parseSessionMetadata("# Just content");

    expect(result.priority).toBe(DEFAULT_PRIORITY);
    expect(result.tags).toEqual([]);
  });

  it("GIVEN empty content WHEN parsed THEN returns defaults", () => {
    const result = parseSessionMetadata("");

    expect(result.priority).toBe(DEFAULT_PRIORITY);
    expect(result.tags).toEqual([]);
  });

  it("GIVEN malformed YAML WHEN parsed THEN returns defaults gracefully", () => {
    const content = `---\npriority: [invalid: yaml:\n---\n# Content`;
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(DEFAULT_PRIORITY);
    expect(result.tags).toEqual([]);
  });

  it("GIVEN invalid priority value WHEN parsed THEN uses DEFAULT_PRIORITY", () => {
    const content = `---\npriority: critical\n---`;
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(DEFAULT_PRIORITY);
  });

  it("GIVEN full metadata WHEN parsed THEN extracts all optional fields", () => {
    const content =
      `---\nid: 2026-01-13_10-00-00\npriority: high\ntags: [feature, cli]\nbranch: feature/session\ncreated_at: 2026-01-13T10:00:00-08:00\nworking_directory: /path/to/project\nspecs:\n  - path/to/spec.md\nfiles:\n  - src/file.ts\n---\n# Session`;
    const result = parseSessionMetadata(content);

    expect(result.id).toBe("2026-01-13_10-00-00");
    expect(result.priority).toBe("high");
    expect(result.tags).toContain("cli");
    expect(result.branch).toBe("feature/session");
    expect(result.createdAt).toBe("2026-01-13T10:00:00-08:00");
    expect(result.workingDirectory).toBe("/path/to/project");
    expect(result.specs).toEqual(["path/to/spec.md"]);
    expect(result.files).toEqual(["src/file.ts"]);
  });

  it("GIVEN front matter with ... delimiter WHEN parsed THEN extracts correctly", () => {
    const content = `---\npriority: low\n...\n# Content`;
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe("low");
  });

  it("GIVEN tags with non-string values WHEN parsed THEN filters them out", () => {
    const content = `---\ntags: [valid, 123, true, null]\n---`;
    const result = parseSessionMetadata(content);

    expect(result.tags).toEqual(["valid"]);
  });
});

describe("parseSessionMetadata properties (property-based)", () => {
  it("GIVEN any valid priority in YAML WHEN parsed THEN roundtrips correctly", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_PRIORITIES),
        (priority) => {
          const content = `---\npriority: ${priority}\n---\n# Content`;
          const result = parseSessionMetadata(content);
          expect(result.priority).toBe(priority);
        },
      ),
    );
  });

  it("GIVEN any string not in valid priorities WHEN parsed THEN returns DEFAULT_PRIORITY", () => {
    const validSet = new Set<string>(VALID_PRIORITIES);
    fc.assert(
      fc.property(
        fc.string().filter((s) => !validSet.has(s) && !s.includes("\n") && !s.includes("---")),
        (invalidPriority) => {
          const content = `---\npriority: ${invalidPriority}\n---\n# Content`;
          const result = parseSessionMetadata(content);
          expect(result.priority).toBe(DEFAULT_PRIORITY);
        },
      ),
    );
  });

  it("GIVEN content without frontmatter WHEN parsed THEN always returns defaults", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.startsWith("---")),
        (content) => {
          const result = parseSessionMetadata(content);
          expect(result.priority).toBe(DEFAULT_PRIORITY);
          expect(result.tags).toEqual([]);
        },
      ),
    );
  });
});
