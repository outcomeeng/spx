import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { renderStyledReport } from "@/lib/styled-output/styled-output";
import { arbitraryStyledReportModel } from "@testing/generators/styled-output/styled-output";

describe("rendering is deterministic", () => {
  it("returns identical output for the same model and color boolean", () => {
    fc.assert(
      fc.property(arbitraryStyledReportModel(), fc.boolean(), (model, color) => {
        expect(renderStyledReport(model, { color })).toBe(renderStyledReport(model, { color }));
      }),
    );
  });
});
