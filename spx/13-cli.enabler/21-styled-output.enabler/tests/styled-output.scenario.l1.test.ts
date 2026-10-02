import { Chalk } from "chalk";
import { describe, expect, it } from "vitest";

import {
  DETAIL_ELBOW,
  DETAIL_INDENT,
  DETAIL_TEE,
  renderStyledReport,
  SEVERITY_STYLE,
} from "@/lib/styled-output/styled-output";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryHeaderDetailsSummaryReport } from "@testing/generators/styled-output/styled-output";

describe("a styled report renders bold headers, dim tree-indented detail, and a severity-colored bold summary", () => {
  it("styles each element per the convention when color is enabled", () => {
    const chalk = new Chalk({ level: 1 });
    const model = sampleGeneratedValue(arbitraryHeaderDetailsSummaryReport());
    const [section] = model.sections;
    const sectionStyle = SEVERITY_STYLE[section.severity];

    const [headerLine, firstDetail, lastDetail, summaryLine] = renderStyledReport(model, { color: true }).split("\n");

    expect(headerLine).toBe(`${chalk[sectionStyle.style](sectionStyle.glyph)} ${chalk.bold(section.header)}`);
    expect(firstDetail).toBe(`${DETAIL_INDENT}${chalk.dim(`${DETAIL_TEE} ${section.details[0]}`)}`);
    expect(lastDetail).toBe(`${DETAIL_INDENT}${chalk.dim(`${DETAIL_ELBOW} ${section.details[1]}`)}`);
    expect(summaryLine).toBe(chalk.bold(chalk[SEVERITY_STYLE[model.summary.severity].style](model.summary.text)));
  });
});
