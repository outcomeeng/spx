import { Chalk, type ChalkInstance } from "chalk";
import { describe, expect, it } from "vitest";

import { renderStyledReport, SEVERITY, type Severity } from "@/lib/styled-output/styled-output";

function expectedGlyph(severity: Severity): string {
  switch (severity) {
    case SEVERITY.OK:
      return "✓";
    case SEVERITY.WARN:
      return "⚠";
    case SEVERITY.ERROR:
      return "✗";
    case SEVERITY.UNKNOWN:
      return "?";
    case SEVERITY.MUTED:
      return "○";
  }
}

function applyExpectedColor(chalk: ChalkInstance, severity: Severity, text: string): string {
  switch (severity) {
    case SEVERITY.OK:
      return chalk.green(text);
    case SEVERITY.WARN:
      return chalk.yellow(text);
    case SEVERITY.ERROR:
    case SEVERITY.UNKNOWN:
      return chalk.red(text);
    case SEVERITY.MUTED:
      return chalk.dim(text);
  }
}

describe("each severity maps to its fixed glyph and color", () => {
  it("renders the registry glyph for every severity in a plain single-section report", () => {
    for (const severity of Object.values(SEVERITY)) {
      const glyph = expectedGlyph(severity);
      const plain = renderStyledReport(
        { sections: [{ severity, header: severity, details: [severity] }], summary: { severity, text: severity } },
        { color: false },
      );

      expect(plain).toContain(glyph);
    }
  });

  it("wraps each severity's glyph in that severity's color when color is enabled", () => {
    const chalk = new Chalk({ level: 1 });

    for (const severity of Object.values(SEVERITY)) {
      const glyph = expectedGlyph(severity);
      const colored = renderStyledReport(
        { sections: [{ severity, header: severity, details: [severity] }], summary: { severity, text: severity } },
        { color: true },
      );

      expect(colored).toContain(applyExpectedColor(chalk, severity, glyph));
    }
  });
});
