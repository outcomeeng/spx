import { Chalk } from "chalk";
import { describe, expect, it } from "vitest";

import { renderStyledReport, SEVERITY, SEVERITY_STYLE } from "@/lib/styled-output/styled-output";

describe("each severity maps to its fixed glyph and color", () => {
  it("renders the registry glyph for every severity in a plain single-section report", () => {
    for (const severity of Object.values(SEVERITY)) {
      const plain = renderStyledReport(
        { sections: [{ severity, header: severity, details: [severity] }], summary: { severity, text: severity } },
        { color: false },
      );

      expect(plain).toContain(SEVERITY_STYLE[severity].glyph);
    }
  });

  it("wraps each severity's glyph in that severity's color when color is enabled", () => {
    const chalk = new Chalk({ level: 1 });

    for (const severity of Object.values(SEVERITY)) {
      const { glyph, style } = SEVERITY_STYLE[severity];
      const colored = renderStyledReport(
        { sections: [{ severity, header: severity, details: [severity] }], summary: { severity, text: severity } },
        { color: true },
      );

      expect(colored).toContain(chalk[style](glyph));
    }
  });
});
