import { describe, expect, it } from "vitest";

import { renderStyledReport } from "@/lib/styled-output/styled-output";
import { arbitraryStyledRenderCase } from "@testing/generators/styled-output/styled-output";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("rendering is deterministic", () => {
  it("returns identical output for the same model and color boolean", () => {
    assertProperty(
      arbitraryStyledRenderCase(),
      ({ model, options }) => {
        expect(renderStyledReport(model, options)).toBe(renderStyledReport(model, options));
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
