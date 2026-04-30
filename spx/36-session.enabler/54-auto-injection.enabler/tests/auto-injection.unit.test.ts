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
 * feature to be implemented in pickupCommand. These tests will be
 * added when the feature exists. For now, only P1 (metadata parsing)
 * is testable.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseSessionMetadata } from "@/session/list";

describe("parseSessionMetadata — specs and files extraction (P1)", () => {
  it("GIVEN session with specs and files arrays WHEN parsed THEN both arrays extracted", () => {
    const content =
      `---\nspecs:\n  - path/to/spec.md\n  - path/to/other.md\nfiles:\n  - src/file.ts\n  - src/other.ts\n---\n# Content`;
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual(["path/to/spec.md", "path/to/other.md"]);
    expect(result.files).toEqual(["src/file.ts", "src/other.ts"]);
  });

  it("GIVEN session without specs/files WHEN parsed THEN fields are undefined (not error)", () => {
    const content = `---\npriority: high\n---\n# Content`;
    const result = parseSessionMetadata(content);

    expect(result.specs).toBeUndefined();
    expect(result.files).toBeUndefined();
  });

  it("GIVEN session with empty specs/files arrays WHEN parsed THEN returns empty arrays", () => {
    const content = `---\nspecs: []\nfiles: []\n---\n# Content`;
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual([]);
    expect(result.files).toEqual([]);
  });

  it("GIVEN session with non-array specs/files WHEN parsed THEN does not throw", () => {
    const content = `---\nspecs: not-an-array\nfiles: 42\n---\n# Content`;

    // Non-array values should not crash — graceful degradation
    expect(() => parseSessionMetadata(content)).not.toThrow();
  });

  it("GIVEN session with mixed-type specs array WHEN parsed THEN only strings kept", () => {
    const content = `---\nspecs: [valid.md, 123, true, null]\nfiles: [src/ok.ts, 456]\n---\n# Content`;
    const result = parseSessionMetadata(content);

    expect(result.specs).toEqual(["valid.md"]);
    expect(result.files).toEqual(["src/ok.ts"]);
  });

  it("GIVEN no front matter WHEN parsed THEN specs and files undefined, never errors", () => {
    const result = parseSessionMetadata("# No frontmatter");

    expect(result.specs).toBeUndefined();
    expect(result.files).toBeUndefined();
  });
});

describe("parseSessionMetadata — specs/files property-based", () => {
  it("GIVEN arbitrary string arrays in YAML WHEN parsed THEN only strings survive", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 5 }),
        (paths) => {
          const yamlArray = paths.length === 0
            ? " []"
            : `\n${paths.map((p) => `  - ${JSON.stringify(p)}`).join("\n")}`;
          const content = `---\nspecs:${yamlArray}\n---\n# Content`;
          const result = parseSessionMetadata(content);

          expect(result.specs).toEqual(paths);
        },
      ),
    );
  });
});
