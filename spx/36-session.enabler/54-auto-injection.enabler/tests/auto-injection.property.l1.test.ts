import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { buildSessionFrontMatterContent, SESSION_FRONT_MATTER_DELIMITER } from "@/domains/session/create";
import { parseSessionMetadata } from "@/domains/session/list";
import { SESSION_FRONT_MATTER } from "@/domains/session/types";
import { arbitraryNonStringArrayValue } from "@testing/generators/session/session";
import { buildSessionMarkdownBody } from "@testing/harnesses/session/harness";

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
      fc.property(arbitraryNonStringArrayValue(), arbitraryNonStringArrayValue(), (specs, files) => {
        const content = buildSessionFrontMatterContent([
          `${SESSION_FRONT_MATTER.SPECS}: ${JSON.stringify(specs)}`,
          `${SESSION_FRONT_MATTER.FILES}: ${JSON.stringify(files)}`,
        ], buildSessionMarkdownBody("non-string arrays"));
        const metadata = parseSessionMetadata(content);

        expect(metadata.specs).toEqual([]);
        expect(metadata.files).toEqual([]);
      }),
    );
  });
});
