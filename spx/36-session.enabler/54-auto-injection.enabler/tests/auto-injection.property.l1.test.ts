import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { parseSessionMetadata } from "@/domains/session/list";
import { SESSION_FRONT_MATTER } from "@/domains/session/types";

const NON_STRING_ARRAY_VALUE = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.dictionary(fc.string({ maxLength: 8 }), fc.string({ maxLength: 8 })),
  fc.array(fc.oneof(fc.integer(), fc.boolean(), fc.constant(null)), { maxLength: 4 }),
);

describe("auto-injection metadata properties", () => {
  it("GIVEN content without frontmatter WHEN parsed THEN specs and files are empty arrays", () => {
    fc.assert(
      fc.property(
        fc.string().filter((content) => !content.startsWith(SESSION_FRONT_MATTER_DELIMITER)),
        (content) => {
          const metadata = parseSessionMetadata(content);

          expect(metadata.specs).toEqual([]);
          expect(metadata.files).toEqual([]);
        },
      ),
    );
  });

  it("GIVEN non-string-array specs and files WHEN parsed THEN specs and files are empty arrays", () => {
    fc.assert(
      fc.property(NON_STRING_ARRAY_VALUE, NON_STRING_ARRAY_VALUE, (specs, files) => {
        const content = `---
${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify(specs)}
${SESSION_FRONT_MATTER.FILES}: ${JSON.stringify(files)}
---
# Session`;
        const metadata = parseSessionMetadata(content);

        expect(metadata.specs).toEqual([]);
        expect(metadata.files).toEqual([]);
      }),
    );
  });
});
