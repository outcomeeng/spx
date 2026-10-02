import { describe, expect, it } from "vitest";

import { renderStyledReport } from "@/lib/styled-output/styled-output";
import { arbitraryStyledReportModel } from "@testing/generators/styled-output/styled-output";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { ANSI_ESCAPE, stripAnsi } from "@testing/harnesses/styled-output/ansi";

describe("styling never changes content", () => {
  it("renders identical content with and without color, differing only by ANSI", () => {
    assertProperty(
      arbitraryStyledReportModel(),
      (model) => {
        expect(stripAnsi(renderStyledReport(model, { color: true }))).toBe(
          renderStyledReport(model, { color: false }),
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("emits no ANSI escape when color is disabled", () => {
    assertProperty(
      arbitraryStyledReportModel(),
      (model) => {
        expect(renderStyledReport(model, { color: false })).not.toContain(ANSI_ESCAPE);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
