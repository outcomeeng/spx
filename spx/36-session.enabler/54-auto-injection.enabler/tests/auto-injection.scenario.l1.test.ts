/**
 * Unit tests for auto-injection metadata parsing.
 *
 * Test Level: 1 (Unit)
 * - Pure function: parseSessionMetadata extracts specs/files arrays
 *
 * Assertions covered from auto-injection.md:
 * - P1: YAML front matter parsing extracts specs and files arrays;
 *   missing or malformed fields produce empty arrays, never errors
 *
 * NOTE: S1-S4 (pickup with injection) require the auto-injection
 * behavior to be implemented in pickupCommand. These tests will be
 * added when the behavior exists. For now, only P1 (metadata parsing)
 * is testable.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildSessionFrontMatterContent } from "@/domains/session/create";
import { parseSessionMetadata } from "@/domains/session/list";
import { SESSION_FRONT_MATTER, SESSION_PRIORITY } from "@/domains/session/types";
import { buildSessionMarkdownBody } from "@testing/harnesses/session/harness";

describe("parseSessionMetadata — specs and files extraction (P1)", () => {
  it("GIVEN session with specs and files arrays WHEN parsed THEN both arrays extracted", () => {
    const expectedSpecs = ["auto/spec.md", "auto/other.md"];
    const expectedFiles = ["auto/file.ts", "auto/other.ts"];
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify(expectedSpecs)}`,
      `${SESSION_FRONT_MATTER.FILES}: ${JSON.stringify(expectedFiles)}`,
    ], buildSessionMarkdownBody("auto-injection arrays"));
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual(expectedSpecs);
    expect(result.files).toEqual(expectedFiles);
  });

  it("GIVEN session without specs/files WHEN parsed THEN fields are empty arrays", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.PRIORITY}: ${SESSION_PRIORITY.HIGH}`,
    ], buildSessionMarkdownBody("no arrays"));
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("GIVEN session with empty specs/files arrays WHEN parsed THEN returns empty arrays", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: []`,
      `${SESSION_FRONT_MATTER.FILES}: []`,
    ], buildSessionMarkdownBody("empty arrays"));
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("GIVEN session with non-array specs/files WHEN parsed THEN does not throw", () => {
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: not-an-array`,
      `${SESSION_FRONT_MATTER.FILES}: 42`,
    ], buildSessionMarkdownBody("non-array values"));

    // Non-array values should not crash — graceful degradation
    expect(() => parseSessionMetadata(content)).not.toThrow();
  });

  it("GIVEN session with mixed-type specs array WHEN parsed THEN only strings kept", () => {
    const expectedSpecs = ["auto-valid.md"];
    const expectedFiles = ["auto-ok.ts"];
    const content = buildSessionFrontMatterContent([
      `${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify([...expectedSpecs, 123, true, null])}`,
      `${SESSION_FRONT_MATTER.FILES}: ${JSON.stringify([...expectedFiles, 456])}`,
    ], buildSessionMarkdownBody("mixed arrays"));
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual(expectedSpecs);
    expect(result.files).toEqual(expectedFiles);
  });

  it("GIVEN no front matter WHEN parsed THEN specs and files are empty arrays", () => {
    const result = parseSessionMetadata("# No frontmatter");

    expect(result.specs).toEqual([]);
    expect(result.files).toEqual([]);
  });
});

describe("parseSessionMetadata — specs/files property-based", () => {
  it("GIVEN arbitrary string arrays in YAML WHEN parsed THEN only strings survive", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 5 }),
        (paths) => {
          const content = buildSessionFrontMatterContent([
            `${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify(paths)}`,
          ], buildSessionMarkdownBody("generated specs"));
          const result = parseSessionMetadata(content);

          expect(result.specs).toEqual(paths);
        },
      ),
    );
  });
});
