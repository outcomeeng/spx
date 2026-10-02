import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { renderStyledReport } from "@/lib/styled-output/styled-output";
import { arbitraryStyledReportModel } from "@testing/generators/styled-output/styled-output";
import { ANSI_ESCAPE, stripAnsi } from "@testing/harnesses/styled-output/ansi";

describe("styling never changes content", () => {
  it("renders identical content with and without color, differing only by ANSI", () => {
    fc.assert(
      fc.property(arbitraryStyledReportModel(), (model) => {
        const colored = renderStyledReport(model, { color: true });
        const plain = renderStyledReport(model, { color: false });

        expect(stripAnsi(colored)).toBe(plain);
      }),
    );
  });

  it("emits no ANSI escape when color is disabled", () => {
    fc.assert(
      fc.property(arbitraryStyledReportModel(), (model) => {
        const plain = renderStyledReport(model, { color: false });

        expect(plain).not.toContain(ANSI_ESCAPE);
      }),
    );
  });
});
