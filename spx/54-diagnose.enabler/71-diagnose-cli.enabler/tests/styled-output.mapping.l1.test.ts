import { describe, it } from "vitest";

import { STYLED_BUCKET_CASES, STYLED_OVERALL_CASES } from "@testing/generators/diagnose/report-scenarios";
import { assertHeadingGlyphCase, assertOverallColorCase } from "@testing/harnesses/diagnose/report";

describe("diagnose styled output mappings", () => {
  it.each(STYLED_BUCKET_CASES)("maps the $bucket bucket to its heading glyph", assertHeadingGlyphCase);
  it.each(STYLED_OVERALL_CASES)("maps the $overall overall verdict to its summary color", assertOverallColorCase);
});
