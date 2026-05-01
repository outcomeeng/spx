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

import {
  buildSessionFrontMatterContent,
  SESSION_FRONT_MATTER_DELIMITER,
  SESSION_FRONT_MATTER_DOCUMENT_END,
} from "@/session/create";
import { parseSessionMetadata } from "@/session/list";
import { buildSessionMarkdownBody } from "@/session/testing/harness";
import { generateSessionId, parseSessionId, SESSION_ID_PATTERN, SESSION_ID_SEPARATOR } from "@/session/timestamp";
import { DEFAULT_PRIORITY, SESSION_FRONT_MATTER, SESSION_PRIORITY, type SessionPriority } from "@/session/types";

/** Valid priorities derived from the type, not hardcoded. */
const VALID_PRIORITIES: readonly SessionPriority[] = Object.values(SESSION_PRIORITY);
const PROPERTY_DATE_MIN = new Date(2000, 0, 1, 0, 0, 0);
const PROPERTY_DATE_MAX = new Date(2099, 11, 28, 23, 59, 59);

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
    const validDate = fc.date({
      min: PROPERTY_DATE_MIN,
      max: PROPERTY_DATE_MAX,
      noInvalidDate: true,
    });

    fc.assert(
      fc.property(validDate, (original) => {
        const id = generateSessionId({ now: () => original });
        const parsed = parseSessionId(id);

        expect(parsed).not.toBeNull();
        expect(parsed!.getFullYear()).toBe(original.getFullYear());
        expect(parsed!.getMonth()).toBe(original.getMonth());
        expect(parsed!.getDate()).toBe(original.getDate());
        expect(parsed!.getHours()).toBe(original.getHours());
        expect(parsed!.getMinutes()).toBe(original.getMinutes());
        expect(parsed!.getSeconds()).toBe(original.getSeconds());
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
    const expected = {
      id: "test",
      priority: SESSION_PRIORITY.HIGH,
      tags: ["bug", "urgent"],
    };
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.ID}: ${expected.id}`,
      `${SESSION_FRONT_MATTER.PRIORITY}: ${expected.priority}`,
      `${SESSION_FRONT_MATTER.TAGS}: [${expected.tags.join(", ")}]`,
    ], buildSessionMarkdownBody("identity metadata"));
    const result = parseSessionMetadata(content);

    expect(result.id).toBe(expected.id);
    expect(result.priority).toBe(expected.priority);
    expect(result.tags).toEqual(expected.tags);
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
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: [invalid: yaml:`,
    ], buildSessionMarkdownBody("malformed metadata"));
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(DEFAULT_PRIORITY);
    expect(result.tags).toEqual([]);
  });

  it("GIVEN YAML that parses to null WHEN parsed THEN returns defaults", () => {
    const content = buildSessionFrontMatterContent(["null"], buildSessionMarkdownBody("null metadata"));
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(DEFAULT_PRIORITY);
    expect(result.tags).toEqual([]);
  });

  it("GIVEN YAML that parses to a scalar (non-object) WHEN parsed THEN returns defaults", () => {
    const content = buildSessionFrontMatterContent(["just a string"], buildSessionMarkdownBody("scalar metadata"));
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(DEFAULT_PRIORITY);
    expect(result.tags).toEqual([]);
  });

  it("GIVEN invalid priority value WHEN parsed THEN uses DEFAULT_PRIORITY", () => {
    const content = buildSessionFrontMatterContent([`${SESSION_FRONT_MATTER.PRIORITY}: critical`], "");
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(DEFAULT_PRIORITY);
  });

  it("GIVEN full metadata WHEN parsed THEN extracts all optional fields", () => {
    const expected = {
      id: "2026-01-13_10-00-00",
      priority: SESSION_PRIORITY.HIGH,
      tags: ["metadata", "cli"],
      branch: "feature/session",
      createdAt: "2026-01-13T10:00:00-08:00",
      workingDirectory: "/path/to/project",
      specs: ["path/to/spec.md"],
      files: ["src/file.ts"],
    };
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.ID}: ${expected.id}`,
      `${SESSION_FRONT_MATTER.PRIORITY}: ${expected.priority}`,
      `${SESSION_FRONT_MATTER.TAGS}: [${expected.tags.join(", ")}]`,
      `${SESSION_FRONT_MATTER.BRANCH}: ${expected.branch}`,
      `${SESSION_FRONT_MATTER.CREATED_AT}: ${expected.createdAt}`,
      `${SESSION_FRONT_MATTER.WORKING_DIRECTORY}: ${expected.workingDirectory}`,
      `${SESSION_FRONT_MATTER.SPECS}:`,
      `  - ${expected.specs[0]}`,
      `${SESSION_FRONT_MATTER.FILES}:`,
      `  - ${expected.files[0]}`,
    ], "# Session");
    const result = parseSessionMetadata(content);

    expect(result.id).toBe(expected.id);
    expect(result.priority).toBe(expected.priority);
    expect(result.tags).toEqual(expected.tags);
    expect(result.branch).toBe(expected.branch);
    expect(result.createdAt).toBe(expected.createdAt);
    expect(result.workingDirectory).toBe(expected.workingDirectory);
    expect(result.specs).toEqual(expected.specs);
    expect(result.files).toEqual(expected.files);
  });

  it("GIVEN front matter with ... delimiter WHEN parsed THEN extracts correctly", () => {
    const expectedPriority = SESSION_PRIORITY.LOW;
    const content = buildSessionFrontMatterContent(
      [`${SESSION_FRONT_MATTER.PRIORITY}: ${expectedPriority}`],
      buildSessionMarkdownBody("document-end delimiter"),
      SESSION_FRONT_MATTER_DOCUMENT_END,
    );
    const result = parseSessionMetadata(content);

    expect(result.priority).toBe(expectedPriority);
  });

  it("GIVEN tags with non-string values WHEN parsed THEN filters them out", () => {
    const expectedTags = ["valid"];
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.TAGS}: [${expectedTags[0]}, 123, true, null]`,
    ], "");
    const result = parseSessionMetadata(content);

    expect(result.tags).toEqual(expectedTags);
  });
});

describe("parseSessionMetadata properties (property-based)", () => {
  it("GIVEN any valid priority in YAML WHEN parsed THEN roundtrips correctly", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_PRIORITIES),
        (priority) => {
          const content = buildSessionFrontMatterContent([
            `${SESSION_FRONT_MATTER.PRIORITY}: ${priority}`,
          ], buildSessionMarkdownBody("priority roundtrip"));
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
        fc.string().filter((s) => !validSet.has(s) && !s.includes("\n") && !s.includes(SESSION_FRONT_MATTER_DELIMITER)),
        (invalidPriority) => {
          const content = buildSessionFrontMatterContent([
            `${SESSION_FRONT_MATTER.PRIORITY}: ${JSON.stringify(invalidPriority)}`,
          ], buildSessionMarkdownBody("invalid priority fallback"));
          const result = parseSessionMetadata(content);
          expect(result.priority).toBe(DEFAULT_PRIORITY);
        },
      ),
    );
  });

  it("GIVEN content without frontmatter WHEN parsed THEN always returns defaults", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.startsWith(SESSION_FRONT_MATTER_DELIMITER)),
        (content) => {
          const result = parseSessionMetadata(content);
          expect(result.priority).toBe(DEFAULT_PRIORITY);
          expect(result.tags).toEqual([]);
        },
      ),
    );
  });
});
