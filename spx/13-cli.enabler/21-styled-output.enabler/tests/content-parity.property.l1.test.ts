import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { renderStyledReport } from "@/lib/styled-output/styled-output";
import { arbitraryStyledReportModel } from "@testing/generators/styled-output/styled-output";

// The ANSI escape (ESC) code point; built here to avoid an invisible control byte in source.
const escCharCode = 27;
const ansiEscape = String.fromCodePoint(escCharCode);
const ansiSequence = new RegExp(String.raw`${ansiEscape}\[[0-9;]*m`, "g");
const stripAnsi = (value: string): string => value.replaceAll(ansiSequence, "");

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

        expect(plain).not.toContain(ansiEscape);
      }),
    );
  });
});
