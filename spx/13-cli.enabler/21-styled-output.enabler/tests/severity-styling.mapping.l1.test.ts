import { Chalk } from "chalk";
import { describe, expect, it } from "vitest";

import {
  COLOR_LEVEL,
  GLYPH_HEADER_SEPARATOR,
  renderStyledReport,
  SEVERITY,
  SEVERITY_STYLE,
  TREE_LINE_SEPARATOR,
} from "@/lib/styled-output/styled-output";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitrarySingleSeverityReport } from "@testing/generators/styled-output/styled-output";

describe("each severity maps to its fixed glyph and color", () => {
  it("renders the registry glyph before the header for every severity when color is disabled", () => {
    for (const severity of Object.values(SEVERITY)) {
      const model = sampleGeneratedValue(arbitrarySingleSeverityReport(severity));
      const [headerLine] = renderStyledReport(model, { color: false }).split(TREE_LINE_SEPARATOR);

      expect(headerLine).toBe(`${SEVERITY_STYLE[severity].glyph}${GLYPH_HEADER_SEPARATOR}${model.sections[0].header}`);
    }
  });

  it("wraps each severity's glyph in that severity's color when color is enabled", () => {
    const chalk = new Chalk({ level: COLOR_LEVEL.ENABLED });

    for (const severity of Object.values(SEVERITY)) {
      const { glyph, style } = SEVERITY_STYLE[severity];
      const model = sampleGeneratedValue(arbitrarySingleSeverityReport(severity));
      const [headerLine] = renderStyledReport(model, { color: true }).split(TREE_LINE_SEPARATOR);

      expect(headerLine).toBe(`${chalk[style](glyph)}${GLYPH_HEADER_SEPARATOR}${chalk.bold(model.sections[0].header)}`);
    }
  });
});
