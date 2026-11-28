import { describe, expect, it } from "vitest";

import { buildDprintCheckArgs } from "@/validation/steps/formatting";
import {
  arbitraryDprintFileArguments,
  FORMATTING_VALIDATION_DATA as DATA,
} from "@testing/generators/validation/formatting";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("dprint argument construction", () => {
  it("is deterministic and keeps the subcommand, the excludes, and the file scope in their positions", () => {
    assertProperty(
      arbitraryDprintFileArguments().chain((excludes) =>
        arbitraryDprintFileArguments().map((files) => ({ excludes, files }))
      ),
      ({ excludes, files }) => {
        const first = buildDprintCheckArgs({ excludes, files });
        const second = buildDprintCheckArgs({ excludes, files });
        const expectedExcludes = excludes.length > 0 ? [DATA.expectedDprintExcludesOption, ...excludes] : [];
        const expectedFiles = files.length > 0 ? [DATA.expectedDprintOptionsTerminator, ...files] : [];

        expect(second).toEqual(first);
        expect(first).toEqual([DATA.expectedDprintCheckSubcommand, ...expectedExcludes, ...expectedFiles]);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
