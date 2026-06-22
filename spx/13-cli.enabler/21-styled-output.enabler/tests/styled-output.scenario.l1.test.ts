import { Chalk } from "chalk";
import { describe, expect, it } from "vitest";

import {
  DETAIL_ELBOW,
  DETAIL_INDENT,
  DETAIL_TEE,
  renderStyledReport,
  SEVERITY,
  SEVERITY_STYLE,
} from "@/lib/styled-output/styled-output";

describe("a styled report renders bold headers, dim tree-indented detail, and a severity-colored bold summary", () => {
  it("styles each element per the convention when color is enabled", () => {
    const chalk = new Chalk({ level: 1 });
    const section = { severity: SEVERITY.OK, header: SEVERITY.OK, details: [SEVERITY.WARN, SEVERITY.ERROR] };
    const summary = { severity: SEVERITY.ERROR, text: SEVERITY.ERROR };

    const [headerLine, firstDetail, lastDetail, summaryLine] = renderStyledReport(
      { sections: [section], summary },
      { color: true },
    ).split("\n");

    const okStyle = SEVERITY_STYLE[SEVERITY.OK];
    const firstDetailText = `${DETAIL_TEE} ${section.details[0]}`;
    const lastDetailText = `${DETAIL_ELBOW} ${section.details[1]}`;
    expect(headerLine).toBe(`${chalk[okStyle.style](okStyle.glyph)} ${chalk.bold(section.header)}`);
    expect(firstDetail).toBe(`${DETAIL_INDENT}${chalk.dim(firstDetailText)}`);
    expect(lastDetail).toBe(`${DETAIL_INDENT}${chalk.dim(lastDetailText)}`);
    expect(summaryLine).toBe(chalk.bold(chalk[SEVERITY_STYLE[SEVERITY.ERROR].style](summary.text)));
  });
});
