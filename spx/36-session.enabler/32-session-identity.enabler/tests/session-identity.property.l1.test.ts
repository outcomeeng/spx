import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildSessionFrontMatterContent, SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { DEFAULT_SESSION_METADATA, parseSessionMetadata } from "@/domains/session/list";
import { generateSessionId, parseSessionId, SESSION_ID_PATTERN } from "@/domains/session/timestamp";

const PROPERTY_DATE_MIN = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
const PROPERTY_DATE_MAX = new Date(Date.UTC(2099, 11, 28, 23, 59, 59));

function truncateToSecond(instant: Date): number {
  return instant.getTime() - instant.getMilliseconds();
}

describe("session identity properties", () => {
  it("GIVEN any valid Date WHEN generated THEN ID matches the canonical pattern", () => {
    fc.assert(
      fc.property(
        fc.date({ min: PROPERTY_DATE_MIN, max: PROPERTY_DATE_MAX, noInvalidDate: true }),
        (instant) => {
          expect(generateSessionId({ now: () => instant })).toMatch(SESSION_ID_PATTERN);
        },
      ),
    );
  });

  it("GIVEN any two valid Dates WHEN IDs compared THEN lexicographic order matches chronological order", () => {
    fc.assert(
      fc.property(
        fc.date({ min: PROPERTY_DATE_MIN, max: PROPERTY_DATE_MAX, noInvalidDate: true }),
        fc.date({ min: PROPERTY_DATE_MIN, max: PROPERTY_DATE_MAX, noInvalidDate: true }),
        (left, right) => {
          const leftId = generateSessionId({ now: () => left });
          const rightId = generateSessionId({ now: () => right });
          const chronological = truncateToSecond(left) - truncateToSecond(right);
          const lexicographic = leftId.localeCompare(rightId);

          if (chronological < 0) expect(lexicographic).toBeLessThan(0);
          else if (chronological > 0) expect(lexicographic).toBeGreaterThan(0);
          else expect(lexicographic).toBe(0);

          expect(parseSessionId(leftId)?.getTime()).toBe(truncateToSecond(left));
        },
      ),
    );
  });

  it("GIVEN content without frontmatter WHEN parsed THEN canonical defaults are returned", () => {
    fc.assert(
      fc.property(
        fc.string().filter((content) => !content.startsWith(SESSION_FRONT_MATTER_DELIMITER)),
        (content) => {
          expect(parseSessionMetadata(content)).toEqual(DEFAULT_SESSION_METADATA);
        },
      ),
    );
  });

  it("GIVEN invalid priority values WHEN parsed THEN default priority is used", () => {
    fc.assert(
      fc.property(
        fc.string().filter((priority) =>
          !["high", "medium", "low"].includes(priority)
          && !priority.includes("\n")
          && !priority.includes(SESSION_FRONT_MATTER_DELIMITER)
        ),
        (priority) => {
          const content = buildSessionFrontMatterContent([`priority: ${JSON.stringify(priority)}`], "# Session");

          expect(parseSessionMetadata(content).priority).toBe(DEFAULT_SESSION_METADATA.priority);
        },
      ),
    );
  });
});
