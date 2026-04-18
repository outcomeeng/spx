/**
 * Unit tests for session identity: timestamp ID generation/parsing and YAML metadata extraction.
 *
 * Test Level: 1 (Unit)
 * - Pure functions with DI (injected clock): generateSessionId, parseSessionId
 * - Pure function: parseSessionMetadata
 * - Property-based tests mandatory (parser roundtrips)
 *
 * Spec: 32-session-identity.enabler/session-identity.md
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseSessionMetadata } from "@/session/list";
import { generateSessionId, parseSessionId, SESSION_ID_PATTERN, SESSION_ID_SEPARATOR } from "@/session/timestamp";
import { DEFAULT_PRIORITY, type SessionPriority } from "@/session/types";

/** Valid priorities derived from the type, not hardcoded. */
const VALID_PRIORITIES: readonly SessionPriority[] = ["high", "medium", "low"] as const;

describe("generateSessionId", () => {
  it("GIVEN injected time WHEN generated THEN matches SESSION_ID_PATTERN", () => {
    const id = generateSessionId({
      now: () => new Date(2026, 0, 13, 8, 1, 5),
    });

    expect(id).toMatch(SESSION_ID_PATTERN);
    expect(id).toContain(SESSION_ID_SEPARATOR);
  });

  it("GIVEN single-digit components WHEN generated THEN zero-pads all fields", () => {
    const id = generateSessionId({
      now: () => new Date(2026, 0, 3, 5, 7, 9),
    });

    expect(id).toBe(`2026-01-03${SESSION_ID_SEPARATOR}05-07-09`);
  });

  it("GIVEN end-of-day time WHEN generated THEN handles 23:59:59", () => {
    const id = generateSessionId({
      now: () => new Date(2026, 11, 31, 23, 59, 59),
    });

    expect(id).toBe(`2026-12-31${SESSION_ID_SEPARATOR}23-59-59`);
  });
});

describe("parseSessionId", () => {
  it("GIVEN valid session ID WHEN parsed THEN returns Date with correct components", () => {
    const date = parseSessionId(`2026-01-13${SESSION_ID_SEPARATOR}08-01-05`);

    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(0); // January = 0
    expect(date!.getDate()).toBe(13);
    expect(date!.getHours()).toBe(8);
    expect(date!.getMinutes()).toBe(1);
    expect(date!.getSeconds()).toBe(5);
  });

  it("GIVEN invalid format WHEN parsed THEN returns null", () => {
    expect(parseSessionId("not-a-timestamp")).toBeNull();
    expect(parseSessionId("")).toBeNull();
    expect(parseSessionId("2026/01/13 08:01:05")).toBeNull();
  });

  it("GIVEN out-of-range month WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`2026-13-01${SESSION_ID_SEPARATOR}00-00-00`)).toBeNull();
    expect(parseSessionId(`2026-00-01${SESSION_ID_SEPARATOR}00-00-00`)).toBeNull();
  });

  it("GIVEN out-of-range hour WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`2026-01-01${SESSION_ID_SEPARATOR}24-00-00`)).toBeNull();
  });

  it("GIVEN out-of-range minute WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`2026-01-01${SESSION_ID_SEPARATOR}00-60-00`)).toBeNull();
  });

  it("GIVEN out-of-range second WHEN parsed THEN returns null", () => {
    expect(parseSessionId(`2026-01-01${SESSION_ID_SEPARATOR}00-00-60`)).toBeNull();
  });
});

describe("generateSessionId → parseSessionId roundtrip (property-based)", () => {
  it("GIVEN any valid Date WHEN generated then parsed THEN roundtrips correctly", () => {
    // Arbitrary for valid date components
    const validDate = fc.record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 0, max: 11 }),
      day: fc.integer({ min: 1, max: 28 }), // 28 to avoid month-length issues
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    });

    fc.assert(
      fc.property(validDate, ({ year, month, day, hour, minute, second }) => {
        const original = new Date(year, month, day, hour, minute, second);
        const id = generateSessionId({ now: () => original });
        const parsed = parseSessionId(id);

        expect(parsed).not.toBeNull();
        expect(parsed!.getFullYear()).toBe(year);
        expect(parsed!.getMonth()).toBe(month);
        expect(parsed!.getDate()).toBe(day);
        expect(parsed!.getHours()).toBe(hour);
        expect(parsed!.getMinutes()).toBe(minute);
        expect(parsed!.getSeconds()).toBe(second);
      }),
    );
  });

  it("GIVEN two different times WHEN generated THEN lexicographic order matches chronological order", () => {
    const validDate = fc.record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 0, max: 11 }),
      day: fc.integer({ min: 1, max: 28 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    });

    fc.assert(
      fc.property(validDate, validDate, (a, b) => {
        const dateA = new Date(a.year, a.month, a.day, a.hour, a.minute, a.second);
        const dateB = new Date(b.year, b.month, b.day, b.hour, b.minute, b.second);
        const idA = generateSessionId({ now: () => dateA });
        const idB = generateSessionId({ now: () => dateB });

        const chronological = dateA.getTime() - dateB.getTime();
        const lexicographic = idA.localeCompare(idB);

        // Same sign or both zero
        if (chronological < 0) expect(lexicographic).toBeLessThan(0);
        else if (chronological > 0) expect(lexicographic).toBeGreaterThan(0);
        else expect(lexicographic).toBe(0);
      }),
    );
  });
});

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

  it("GIVEN YAML that parses to null WHEN parsed THEN returns defaults", () => {
    const content = `---\nnull\n---\n# Content`;
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(DEFAULT_PRIORITY);
    expect(result.tags).toEqual([]);
  });

  it("GIVEN YAML that parses to a scalar (non-object) WHEN parsed THEN returns defaults", () => {
    const content = `---\njust a string\n---\n# Content`;
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
